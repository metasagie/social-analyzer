//  -------------------------------------------------------------
//  Head Hunter Agency - live connector layer
//  -------------------------------------------------------------
//  The detection engine talks to any of the ~1000 catalogued sites.
//  On top of it this module keeps a small set of *verified* connectors
//  that use official/first-party endpoints, so a finding can be
//  enriched with first-party data (avatar, bio, repositories, linked
//  accounts, package ownership...) instead of scraping markup.
//  Everything here is a real network request through the same proxy /
//  user-agent configuration used by the scanner.
//  -------------------------------------------------------------

import https from 'follow-redirects'
import * as cheerio from 'cheerio'
import helper from './helper.js'

const DEFAULT_TIMEOUT_MS = 8000
const MAX_BODY = 1.5 * 1024 * 1024

export const CONNECTORS = [
  {
    id: 'github',
    label: 'GitHub',
    host: 'github.com',
    category: 'Developers & Code',
    accent: '#7c8cff',
    profile_url: 'https://github.com/{username}',
    api: 'https://api.github.com/users/{username}',
    capabilities: ['identity', 'repos', 'social_accounts', 'join_date', 'avatar', 'geo']
  },
  {
    id: 'pypi',
    label: 'PyPI',
    host: 'pypi.org',
    category: 'Developers & Code',
    accent: '#5fb187',
    profile_url: 'https://pypi.org/user/{username}',
    api: 'https://pypi.org/user/{username}/',
    capabilities: ['identity', 'packages', 'join_date']
  },
  {
    id: 'npm',
    label: 'npm Registry',
    host: 'registry.npmjs.org',
    category: 'Developers & Code',
    accent: '#d9534f',
    profile_url: 'https://www.npmjs.com/~{username}',
    api: 'https://registry.npmjs.org/-/v1/search?text=maintainer:{username}&size=20',
    capabilities: ['identity', 'packages', 'publisher']
  }
]

function headers_for (extra = {}) {
  const base = Object.assign({}, helper.header_options.headers)
  return Object.assign(base, extra)
}

/**
 * Minimal HTTPS helper honouring the configured proxy/user-agent, with a
 * hard timeout, redirect support and a body size ceiling.
 */
export function request (url, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS
  const started = Date.now()
  return new Promise((resolve) => {
    let settled = false
    const done = (payload) => {
      if (!settled) {
        settled = true
        resolve(Object.assign({ latency_ms: Date.now() - started, url }, payload))
      }
    }
    let request
    try {
      request = https.https.get(url, {
        headers: headers_for(options.headers || {}),
        agent: helper.header_options.agent,
        timeout
      }, function (res) {
        let body = ''
        res.on('data', function (chunk) {
          body += chunk
          if (body.length > MAX_BODY) {
            body = body.slice(0, MAX_BODY)
            res.destroy()
          }
        })
        res.on('end', function () {
          done({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body, headers: res.headers })
        })
        res.on('error', function (err) {
          done({ ok: false, status: 0, body: body, error: err.code || err.message })
        })
      })
    } catch (err) {
      done({ ok: false, status: 0, body: '', error: err.code || err.message })
      return
    }
    request.setTimeout(timeout, function () {
      try { request.destroy() } catch (err) {}
      done({ ok: false, status: 0, body: '', error: 'ETIMEDOUT' })
    })
    request.on('error', function (err) {
      done({ ok: false, status: 0, body: '', error: err.code || err.message })
    })
  })
}

export async function request_json (url, options = {}) {
  const res = await request(url, options)
  let data = null
  try {
    data = JSON.parse(res.body)
  } catch (err) {
    data = null
  }
  return Object.assign({}, res, { data })
}

/** Reachability probe used by the network status view. */
export async function probe (url, options = {}) {
  const res = await request(url, { timeout: options.timeout || 6000, headers: options.headers })
  const blocked = !res.ok
  return {
    url,
    host: host_of(url),
    ok: res.ok,
    status: res.status,
    latency_ms: res.latency_ms,
    error: res.error || (res.ok ? '' : 'HTTP ' + res.status),
    blocked,
    reason: classify_error(res.error, res.status),
    checked_at: Date.now()
  }
}

function host_of (url) {
  try {
    return new URL(url).hostname
  } catch (err) {
    return url
  }
}

function classify_error (error, status) {
  if (!error && status) {
    if (status === 403 || status === 429) return 'rate-limited'
    if (status === 402) return 'payment-required'
    if (status >= 500) return 'upstream-error'
    return status >= 400 ? 'http-' + status : 'ok'
  }
  if (error === 'ETIMEDOUT' || error === 'ESOCKETTIMEDOUT') return 'timeout'
  if (error === 'ECONNRESET' || error === 'ECONNREFUSED' || error === 'ENETUNREACH' || error === 'EHOSTUNREACH') return 'egress-blocked'
  if (error === 'ENOTFOUND' || error === 'EAI_AGAIN') return 'dns'
  return error || 'unknown'
}

function clean (value) {
  return typeof value === 'string' ? value.trim() : value
}

/* ------------------------------- GitHub ------------------------------- */

export async function github_profile (username, options = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (options.token) headers.Authorization = 'Bearer ' + options.token
  const res = await request_json('https://api.github.com/users/' + encodeURIComponent(username), { headers, timeout: options.timeout || 8000 })
  if (!res.data || !res.data.login) {
    return { found: false, platform: 'github', username, status: res.status, error: res.error || (res.status === 404 ? 'not-found' : 'unavailable'), latency_ms: res.latency_ms }
  }
  const data = res.data
  return {
    found: true,
    platform: 'github',
    verified: true,
    username: data.login,
    url: data.html_url,
    name: clean(data.name) || '',
    bio: clean(data.bio) || '',
    avatar_url: data.avatar_url || '',
    company: clean(data.company) || '',
    blog: clean(data.blog) || '',
    location: clean(data.location) || '',
    email: clean(data.email) || '',
    twitter_username: clean(data.twitter_username) || '',
    hireable: !!data.hireable,
    public_repos: data.public_repos || 0,
    public_gists: data.public_gists || 0,
    followers: data.followers || 0,
    following: data.following || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
    account_age_years: data.created_at ? Number(((Date.now() - Date.parse(data.created_at)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1)) : null,
    type: data.type,
    source: 'live',
    latency_ms: res.latency_ms
  }
}

export async function github_repos (username, options = {}) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (options.token) headers.Authorization = 'Bearer ' + options.token
  const url = 'https://api.github.com/users/' + encodeURIComponent(username) + '/repos?per_page=' + (options.limit || 12) + '&sort=updated'
  const res = await request_json(url, { headers })
  if (!Array.isArray(res.data)) return []
  return res.data.map(repo => ({
    name: repo.name,
    url: repo.html_url,
    description: clean(repo.description) || '',
    language: repo.language || '',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    size_kb: repo.size || 0,
    fork: !!repo.fork,
    updated_at: repo.updated_at,
    created_at: repo.created_at,
    topics: repo.topics || [],
    homepage: clean(repo.homepage) || ''
  }))
}

export async function github_social_accounts (username, options = {}) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (options.token) headers.Authorization = 'Bearer ' + options.token
  const res = await request_json('https://api.github.com/users/' + encodeURIComponent(username) + '/social_accounts', { headers })
  if (!Array.isArray(res.data)) return []
  return res.data.map(item => ({ provider: item.provider, url: item.url, handle: handle_from_url(item.url) }))
}

function handle_from_url (url) {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1].replace('@', '') : parsed.hostname
  } catch (err) {
    return ''
  }
}

/* -------------------------------- PyPI -------------------------------- */

export async function pypi_user (username, options = {}) {
  const res = await request('https://pypi.org/user/' + encodeURIComponent(username) + '/', { timeout: options.timeout || 8000 })
  if (!res.ok) {
    return { found: false, platform: 'pypi', username, status: res.status, error: res.error || (res.status === 404 ? 'not-found' : 'unavailable'), latency_ms: res.latency_ms }
  }
  if (/client challenge|javascript is disabled|just a moment|checking your browser/i.test(res.body)) {
    return { found: false, platform: 'pypi', username, status: res.status, error: 'anti-bot interstitial', latency_ms: res.latency_ms }
  }
  const $ = cheerio.load(res.body)
  const packages = []
  $('a.package-snippet, .package-snippet').each((index, element) => {
    const name = $(element).find('.package-snippet__name').text().trim() || $(element).text().trim().split('\n')[0]
    const version = $(element).find('.package-snippet__version').text().trim()
    const description = $(element).find('.package-snippet__description').text().trim()
    if (name) packages.push({ name, version, description })
  })
  const joined_text = $('p:contains("Date joined")').text() || ''
  const joined_match = joined_text.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/)
  return {
    found: true,
    platform: 'pypi',
    verified: true,
    username,
    url: 'https://pypi.org/user/' + username + '/',
    avatar_url: $('img.user-image, img').first().attr('src') || '',
    name: $('h1').first().text().trim() || username,
    packages,
    package_count: packages.length,
    joined: joined_match ? joined_match[1] : '',
    source: 'live',
    latency_ms: res.latency_ms
  }
}

/* --------------------------------- npm -------------------------------- */

export async function npm_maintainer (username, options = {}) {
  const url = 'https://registry.npmjs.org/-/v1/search?text=maintainer:' + encodeURIComponent(username) + '&size=' + (options.limit || 20)
  const res = await request_json(url, { timeout: options.timeout || 8000 })
  if (!res.data || !Array.isArray(res.data.objects)) {
    return { found: false, platform: 'npm', username, status: res.status, error: res.error || 'unavailable', latency_ms: res.latency_ms }
  }
  const packages = res.data.objects.map(obj => ({
    name: obj.package && obj.package.name,
    version: obj.package && obj.package.version,
    description: obj.package && obj.package.description,
    date: obj.package && obj.package.date,
    keywords: (obj.package && obj.package.keywords) || [],
    links: (obj.package && obj.package.links) || {},
    publisher: obj.package && obj.package.publisher ? obj.package.publisher.username : '',
    score: obj.score ? obj.score.final : 0
  })).filter(item => item.name)
  const owned = packages.filter(item => String(item.publisher).toLowerCase() === String(username).toLowerCase())
  return {
    found: packages.length > 0,
    platform: 'npm',
    verified: true,
    username,
    url: 'https://www.npmjs.com/~' + username,
    packages,
    package_count: packages.length,
    owned_count: owned.length,
    total_registry_matches: res.data.total || packages.length,
    source: 'live',
    latency_ms: res.latency_ms
  }
}

/* --------------------------- Aggregated lookup ------------------------ */

export async function enrich_identity (username, options = {}) {
  const [github, pypi, npm] = await Promise.all([
    github_profile(username, options).catch(err => ({ found: false, platform: 'github', username, error: String(err.message || err) })),
    pypi_user(username, options).catch(err => ({ found: false, platform: 'pypi', username, error: String(err.message || err) })),
    npm_maintainer(username, options).catch(err => ({ found: false, platform: 'npm', username, error: String(err.message || err) }))
  ])
  let repos = []
  let social = []
  if (github.found && options.deep !== false) {
    repos = await github_repos(github.username, options).catch(() => [])
    social = await github_social_accounts(github.username, options).catch(() => [])
  }
  const handles = new Set([username.toLowerCase()])
  if (github.found) handles.add(String(github.username).toLowerCase())
  const matched = ['github', 'pypi', 'npm'].map(id => (id === 'github' ? github : id === 'pypi' ? pypi : npm))
  return {
    username,
    connectors: matched,
    matched_connectors: matched.filter(item => item.found).map(item => item.platform),
    github,
    pypi,
    npm,
    repos,
    social_accounts: social,
    handle_variants: Array.from(handles),
    checked_at: Date.now()
  }
}

export default {
  CONNECTORS,
  request,
  request_json,
  probe,
  enrich_identity,
  github_profile,
  github_repos,
  github_social_accounts,
  pypi_user,
  npm_maintainer
}
