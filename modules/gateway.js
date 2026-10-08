//  -------------------------------------------------------------
//  Head Hunter Agency - API gateway
//  -------------------------------------------------------------
//  Everything the web console talks to lives here:
//    /api/health /api/sites /api/facets /api/presets /api/probe
//    /api/scan  /api/stream/:job  /api/cases ...  /api/settings
//    /api/lookup/:handle (live connector enrichment)
//  The scanner itself is the original social-analyzer engine
//  (modules/*.js + data/sites.json). This layer adds job control,
//  live connectors, honest provenance reporting and persistence.
//  -------------------------------------------------------------

import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import helper from './helper.js'
import engine from './engine.js'
import nameAnalysis from './name-analysis.js'
import stringAnalysis from './string-analysis.js'
import stats_module from './stats.js'
import connectors from './connectors.js'
import synthesis from './synthesis.js'
import jobs from './jobs.js'
import cases from './cases.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SETTINGS_FILE = path.join(ROOT, 'runtime', 'settings.json')

const APP_NAME = 'Head Hunter Agency'
const APP_TAGLINE = 'Social footprint intelligence console'
const ENGINE_NAME = 'social-analyzer'
const ENGINE_VERSION = '2.0.32'

const DEFAULTS = {
  operator: 'analyst',
  mode: 'auto', // auto | live | sandbox
  max_sites: 36,
  per_site_timeout_ms: 6000,
  concurrency: 14,
  allow_synthetic: true,
  include_nsfw: false,
  deep_enrich: true,
  metadata: true,
  extraction: true,
  identity_analysis: true,
  proxy: '',
  user_agent: helper.header_options.headers['User-Agent'],
  github_token: '',
  google_key: '',
  google_cs: '',
  selected_sites: []
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

let settings = Object.assign({}, DEFAULTS)

function load_settings () {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      settings = Object.assign({}, DEFAULTS, parsed)
    }
  } catch (err) {
    settings = Object.assign({}, DEFAULTS)
  }
  apply_network_settings()
  return settings
}

function save_settings (patch) {
  settings = Object.assign({}, settings, patch)
  try {
    if (!fs.existsSync(path.dirname(SETTINGS_FILE))) fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  } catch (err) {}
  apply_network_settings()
  return settings
}

function apply_network_settings () {
  try {
    if (settings.user_agent) helper.header_options.headers['User-Agent'] = settings.user_agent
    if (settings.proxy !== helper.proxy) {
      helper.proxy = settings.proxy || ''
      if (helper.proxy) {
        // Lazy import so a bad proxy string can never break boot.
        import('https-proxy-agent').then(module => {
          const Agent = module.default
          helper.header_options.agent = new Agent(helper.proxy)
        }).catch(() => {})
      } else if (helper.header_options.agent) {
        delete helper.header_options.agent
      }
    }
  } catch (err) {}
}

function public_settings () {
  return Object.assign({}, settings, {
    github_token: settings.github_token ? '••••••••' + String(settings.github_token).slice(-4) : '',
    has_github_token: !!settings.github_token
  })
}

/* ------------------------------------------------------------------ */
/* site database                                                       */
/* ------------------------------------------------------------------ */

const SITES = helper.websites_entries.map((site, index) => ({
  index,
  host: helper.get_site_from_url(site.url),
  url_template: site.url,
  category: site.type || 'Uncategorised',
  country: site.country || 'Unspecified',
  rank: Number(site.global_rank) || 0,
  nsfw: site.nsfw === 'true',
  detections: (site.detections || []).map(detection => detection.name).filter(Boolean),
  detection_engine: (site.detections || []).map(detection => detection.type).filter(Boolean)
}))

const DETECTION_COUNT = helper.websites_entries.reduce((sum, site) => sum + (site.detections || []).length, 0)
const CONNECTOR_HOSTS = connectors.CONNECTORS.map(connector => connector.host)
// sites.json knows github.com / pypi.org / npmjs.com - the first two are also
// first-party APIs we can reach and verify. They are always worth a slot.
const FIRST_PARTY_HOSTS = ['github.com', 'pypi.org', 'npmjs.com']

// Interstitials that look like a page but carry no profile information.
const CHALLENGE_PATTERNS = /client challenge|just a moment|checking your browser|enable javascript|javascript is disabled|attention required|cf-browser-verification|ddos protection|captcha|access denied|are you a robot/i

function looks_like_challenge (html, title) {
  const haystack = (String(title || '') + ' ' + String(html || '').slice(0, 4000))
  return CHALLENGE_PATTERNS.test(haystack)
}

function site_belongs (site, preset) {
  const category = site.category.toLowerCase()
  switch (preset) {
    case 'social': return /social network|online communit/.test(category)
    case 'dev': return /programming|computer|software|internet/.test(category)
    case 'music': return /music|audio/.test(category)
    case 'video': return /streaming|tv movies|video/.test(category)
    case 'games': return /game/.test(category)
    case 'dating': return /dating|relationship/.test(category)
    case 'photo': return /photograph|visual arts/.test(category)
    case 'news': return /news|media/.test(category)
    case 'shopping': return /e-commerce|shopping/.test(category)
    case 'education': return /science and education|education|reference/.test(category)
    case 'adult': return site.nsfw || category === 'adult'
    case 'forums': return /forum|wiki|community/.test(category)
    case 'verified': return CONNECTOR_HOSTS.includes(site.host)
    default: return true
  }
}

function ranked_sites () {
  return SITES.filter(site => site.rank > 0).sort((a, b) => a.rank - b.rank)
}

function build_presets () {
  const ranked = ranked_sites()
  const top = n => ranked.slice(0, n).map(site => site.index)
  const presets = [
    { id: 'top10', label: 'Top 10', description: 'The ten highest-traffic platforms', kind: 'rank', sites: top(10) },
    { id: 'top25', label: 'Top 25', description: 'Fast sweep of the biggest platforms', kind: 'rank', sites: top(25) },
    { id: 'top50', label: 'Top 50', description: 'Balanced breadth for a first pass', kind: 'rank', sites: top(50) },
    { id: 'top100', label: 'Top 100', description: 'Wide sweep, longer runtime', kind: 'rank', sites: top(100) },
    { id: 'verified', label: 'Verified connectors', description: 'GitHub, PyPI and npm - first-party APIs', kind: 'connector', sites: SITES.filter(site => CONNECTOR_HOSTS.includes(site.host)).map(site => site.index) }
  ]
  const categories = [
    ['social', 'Social networks'],
    ['dev', 'Developer platforms'],
    ['music', 'Music'],
    ['video', 'Video & streaming'],
    ['games', 'Gaming'],
    ['dating', 'Dating'],
    ['photo', 'Photography'],
    ['news', 'News & media'],
    ['shopping', 'Shopping'],
    ['education', 'Education & reference'],
    ['forums', 'Forums & wikis'],
    ['adult', 'Adult (18+)']
  ]
  categories.forEach(([id, label]) => {
    const matches = SITES.filter(site => site_belongs(site, id)).map(site => site.index)
    presets.push({ id, label, description: matches.length + ' sources', kind: 'category', sites: matches })
  })
  return presets
}

const PRESETS = build_presets()

function presets_map () {
  const map = new Map()
  PRESETS.forEach(preset => map.set(preset.id, preset))
  return map
}

/* ------------------------------------------------------------------ */
/* reachability probes                                                 */
/* ------------------------------------------------------------------ */

let probe_cache = { at: 0, results: [] }
const PROBE_TTL_MS = 1000 * 60 * 10
const PROBE_TARGETS = [
  'https://github.com/explore',
  'https://pypi.org/',
  'https://registry.npmjs.org/',
  'https://instagram.com/',
  'https://facebook.com/',
  'https://x.com/',
  'https://tiktok.com/',
  'https://youtube.com/',
  'https://linkedin.com/',
  'https://reddit.com/',
  'https://pinterest.com/',
  'https://twitch.tv/',
  'https://medium.com/',
  'https://soundcloud.com/',
  'https://steamcommunity.com/',
  'https://discord.com/'
]

let probe_inflight = null

async function run_probes (force = false) {
  if (!force && probe_cache.results.length && Date.now() - probe_cache.at < PROBE_TTL_MS) {
    return probe_cache
  }
  if (probe_inflight) return probe_inflight
  probe_inflight = probe_all().finally(() => { probe_inflight = null })
  return probe_inflight
}

async function probe_all () {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < PROBE_TARGETS.length) {
      const target = PROBE_TARGETS[cursor++]
      const result = await connectors.probe(target, { timeout: 6000 })
      results.push(result)
    }
  })
  await Promise.all(workers)
  results.sort((a, b) => a.host.localeCompare(b.host))
  probe_cache = { at: Date.now(), results, summary: probe_summary(results) }
  return probe_cache
}

function probe_summary (results) {
  const reachable = results.filter(item => item.ok)
  const blocked = results.filter(item => !item.ok)
  const reasons = {}
  blocked.forEach(item => { reasons[item.reason] = (reasons[item.reason] || 0) + 1 })
  return {
    checked: results.length,
    reachable: reachable.length,
    blocked: blocked.length,
    egress_open: reachable.length > results.length / 2,
    median_latency_ms: reachable.length ? reachable.map(item => item.latency_ms).sort((a, b) => a - b)[Math.floor(reachable.length / 2)] : 0,
    block_reasons: reasons,
    checked_at: Date.now()
  }
}

/* ------------------------------------------------------------------ */
/* live detection (the real engine)                                    */
/* ------------------------------------------------------------------ */

function profile_template_live () {
  return Object.assign({}, helper.profile_template)
}

/**
 * Runs the upstream detection engine against one site.
 * Returns a profile record tagged with real provenance.
 */
async function detect_site_live (target, site, options = {}) {
  const url = site.url_template ? site.url_template.replace('{username}', target) : SITES[site.index].url_template.replace('{username}', target)
  const timeout = options.timeout_ms || settings.per_site_timeout_ms
  const response = await connectors.request(url, { timeout })
  const record = {
    site: site.host,
    url,
    category: site.category,
    country: site.country,
    rank: site.rank || 'unavailable',
    reachable: response.ok,
    status_code: response.status,
    latency_ms: response.latency_ms,
    error: response.error || '',
    reason: response.ok ? 'ok' : response.error || ('HTTP ' + response.status)
  }
  if (!response.ok || !response.body) {
    return Object.assign(record, {
      found: 0,
      provenance: 'unreachable',
      provenance_note: 'No response from source (' + (response.error || 'HTTP ' + response.status) + ').',
      profile: null
    })
  }

  // A JS/anti-bot interstitial is a reachable host with an unusable answer:
  // never let it produce a "detection".
  let page_title = ''
  try {
    const cheerio = await import('cheerio')
    page_title = cheerio.load(response.body)('title').text().trim()
  } catch (err) {}
  if (looks_like_challenge(response.body, page_title)) {
    return Object.assign(record, {
      found: 0,
      provenance: 'challenge',
      provenance_note: 'Source answered with an anti-bot / JavaScript interstitial - no profile data could be read.',
      profile: null
    })
  }

  const uuid = options.uuid || 'live'
  const want_metadata = options.metadata !== undefined ? options.metadata : settings.metadata
  const want_extraction = options.extraction !== undefined ? options.extraction : settings.extraction
  const engine_options = 'GetUserProfilesFast,FindUserProfilesFast' + (want_metadata ? ',ExtractMetadata' : '') + (want_extraction ? ',ExtractPatterns' : '')
  let detected
  try {
    detected = await engine.detect('fast', uuid, target, engine_options, helper.websites_entries[site.index], response.body)
  } catch (err) {
    return Object.assign(record, { found: 0, provenance: 'unreachable', error: String(err.message || err), profile: null })
  }
  const [raw_profile, , detections_count] = detected
  const profile = Object.assign(profile_template_live(), raw_profile)
  const level = helper.detection_level[helper.detection_level.current]
  if (profile.found >= level.found && detections_count >= level.count) {
    profile.good = 'true'
  }
  if (profile.good === 'true') {
    const rate = ((profile.found / Math.max(detections_count, 1)) * 100).toFixed(2)
    profile.rate = '%' + rate
    profile.status = Number(rate) >= 100 ? 'good' : Number(rate) >= 50 ? 'maybe' : 'bad'
  } else {
    profile.rate = '%0.00'
    profile.status = 'bad'
  }

  // enrich title/text the same way the upstream fast scanner does
  try {
    const cheerio = await import('cheerio')
    const $ = cheerio.load(response.body)
    let title = $('title').text().trim()
    if (!title) title = 'unavailable'
    profile.title = title.replace(/(\r\n|\n|\r)/gm, '')
    profile.language = profile.language || 'unavailable'
  } catch (err) {}
  if (helper.strings_titles.test(String(profile.title)) || helper.strings_pages.test(String(profile.text))) {
    profile.title = 'filtered'
    profile.text = 'filtered'
  }
  profile.username = target
  profile.link = url
  profile.type = site.category
  profile.rank = site.rank || 'unavailable'
  profile.country = site.country
  profile.og_image = extract_og_image(response.body)
  profile.description = extract_description(response.body)
  profile.method = 'all'
  profile.provenance = 'live'
  profile.provenance_note = 'Real HTTPS response captured from ' + site.host + ' (' + response.latency_ms + ' ms).'
  profile.signals = (site.detections || []).map(name => ({ name, label: 'detection: ' + name, weight: 0 }))

  return Object.assign(record, {
    found: profile.found ? 1 : 0,
    provenance: 'live',
    detections_count,
    profile
  })
}

function extract_og_image (html) {
  const match = String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  return match ? match[1] : ''
}

function extract_description (html) {
  const match = String(html).match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,240})["']/i)
  if (match) return match[1]
  return ''
}

/* ------------------------------------------------------------------ */
/* scan orchestration                                                  */
/* ------------------------------------------------------------------ */

const MODES = ['auto', 'live', 'sandbox']

function normalize_mode (mode) {
  return MODES.includes(mode) ? mode : 'auto'
}

function resolve_sites (payload) {
  const map = presets_map()
  const chosen = new Set()

  if (Array.isArray(payload.sites) && payload.sites.length) {
    payload.sites.forEach(item => {
      const index = Number(item)
      if (Number.isInteger(index) && index >= 0 && index < SITES.length) chosen.add(index)
    })
  }
  const presets = Array.isArray(payload.presets) ? payload.presets : (payload.preset ? [payload.preset] : [])
  presets.forEach(id => {
    const preset = map.get(id)
    if (preset) preset.sites.forEach(index => chosen.add(index))
  })
  if (payload.top) {
    ranked_sites().slice(0, Number(payload.top)).forEach(site => chosen.add(site.index))
  }
  if (!chosen.size) {
    ranked_sites().slice(0, settings.max_sites).forEach(site => chosen.add(site.index))
  }

  let pool = Array.from(chosen).map(index => SITES[index]).filter(Boolean)
  if (!payload.include_nsfw && !settings.include_nsfw) {
    pool = pool.filter(site => !site.nsfw)
  }
  pool = pool.filter(site => SITES[site.index] && site.url_template)
  const limit = Math.max(1, Math.min(Number(payload.max_sites || settings.max_sites || 36), 250))
  pool.sort((a, b) => {
    const rankA = a.rank || Number.MAX_SAFE_INTEGER
    const rankB = b.rank || Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })
  let selected = pool.slice(0, limit)
  // First-party sources (GitHub / PyPI / npm) are always worth a slot: they are
  // the ones that can be verified against official APIs.
  if (payload.include_connectors !== false && payload.mode !== 'sandbox') {
    FIRST_PARTY_HOSTS.forEach(host => {
      const site = SITES.find(item => item.host === host)
      if (site && !selected.some(item => item.index === site.index)) {
        if (selected.length >= limit) {
          selected = selected.slice(0, Math.max(1, limit - 1))
        }
        selected.push(site)
      }
    })
  }
  return { sites: selected, requested: pool.length, limit }
}

async function run_pool (items, worker, concurrency, on_done) {
  const queue = items.slice()
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (cursor < queue.length) {
      const index = cursor++
      const item = queue[index]
      const result = await worker(item, index)
      if (on_done) on_done(item, result, index)
    }
  })
  await Promise.all(runners)
}

function detection_histogram (profiles) {
  const buckets = { '0-24': 0, '25-49': 0, '50-74': 0, '75-99': 0, '100': 0 }
  profiles.forEach(profile => {
    const rate = Number(String(profile.rate || '%0').replace('%', '')) || 0
    if (rate >= 100) buckets['100'] += 1
    else if (rate >= 75) buckets['75-99'] += 1
    else if (rate >= 50) buckets['50-74'] += 1
    else if (rate >= 25) buckets['25-49'] += 1
    else buckets['0-24'] += 1
  })
  return buckets
}

function tally (profiles, key) {
  const map = new Map()
  profiles.forEach(profile => {
    const value = profile[key] || 'Unspecified'
    map.set(value, (map.get(value) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function build_graph (target, profiles, live) {
  const nodes = [{ id: 'target:' + target, label: target, type: 'target', weight: 10 }]
  const links = []
  profiles.forEach(profile => {
    const id = 'site:' + profile.site
    nodes.push({ id, label: profile.site, type: profile.provenance === 'live' ? 'live' : 'synthetic', weight: Number(String(profile.rate || '0').replace('%', '')) / 20 + 2 })
    links.push({ source: 'target:' + target, target: id, value: Number(String(profile.rate || '0').replace('%', '')) || 5 })
  })
  const social = (live && live.social_accounts) || []
  social.forEach(account => {
    const id = 'ext:' + account.provider + ':' + account.handle
    nodes.push({ id, label: account.provider + ' / ' + account.handle, type: 'linked', weight: 6 })
    links.push({ source: 'target:' + target, target: id, value: 60 })
  })
  const pypi = live && live.pypi
  if (pypi && pypi.found && live.github && live.github.found && pypi.name && live.github.name && pypi.name.toLowerCase() === String(live.github.name).toLowerCase()) {
    links.push({ source: 'connector:github', target: 'connector:pypi', value: 40 })
  }
  nodes.push({ id: 'connector:github', label: 'GitHub API', type: 'connector', weight: 5 })
  nodes.push({ id: 'connector:pypi', label: 'PyPI', type: 'connector', weight: 4 })
  nodes.push({ id: 'connector:npm', label: 'npm registry', type: 'connector', weight: 4 })
  links.push({ source: 'target:' + target, target: 'connector:github', value: 30 })
  links.push({ source: 'target:' + target, target: 'connector:pypi', value: 20 })
  links.push({ source: 'target:' + target, target: 'connector:npm', value: 20 })
  return { nodes, links }
}

async function investigate_target (target, pool, context) {
  const { job, payload, live_enrich } = context
  const identity = synthesis.classify_identity(target)
  const profiles = []
  const cleared = []
  const unreachable = []
  let live_found = 0
  let simulated_found = 0
  let reachable_count = 0

  const total = pool.sites.length
  let checked = 0
  jobs.progress(job, { total, checked: 0, live: 0, blocked: 0, found: 0, stage: 'scanning', target, percent: 0 })
  jobs.progress(job, { stage: 'sweep' })
  jobs.log(job, 'Target locked: ' + target + ' · persona guess: ' + identity.label + ' (' + identity.confidence + '% confidence)', 'stage', target)
  jobs.log(job, 'Sweeping ' + total + ' sources with ' + settings.concurrency + ' parallel workers · ' + settings.per_site_timeout_ms + 'ms per source timeout', 'info', target)

  const mode = normalize_mode(payload.mode)
  const live_mode = mode !== 'sandbox'
  const synthetic_allowed = mode !== 'live' && (payload.allow_synthetic !== undefined ? payload.allow_synthetic : settings.allow_synthetic)

  await run_pool(pool.sites, async (site) => {
    if (job.cancel_requested) return { cancelled: true, site }
    let live = null
    if (live_mode && !job.cancel_requested) {
      try {
        live = await detect_site_live(target, site, {
          timeout_ms: payload.per_site_timeout_ms || settings.per_site_timeout_ms,
          uuid: job.id,
          metadata: payload.metadata,
          extraction: payload.extraction
        })
      } catch (err) {
        live = { site: site.host, url: site.url_template.replace('{username}', target), reachable: false, error: String(err.message || err), found: 0, provenance: 'unreachable', profile: null }
      }
    }
    if (live && live.reachable && live.profile) {
      return { site, live, source: 'live' }
    }
    if (live && live.provenance === 'challenge') {
      return { site, live, source: 'challenge' }
    }
    if (synthetic_allowed) {
      const synthesized = synthesis.synthesize_check(target, {
        url: site.url_template,
        type: site.category,
        country: site.country,
        global_rank: site.rank,
        nsfw: site.nsfw ? 'true' : 'false'
      }, { identity })
      return { site, synthesized, source: 'synthetic', live_error: live ? (live.error || live.reason) : 'synthetic mode' }
    }
    return { site, source: 'unreachable', live_error: live ? (live.error || live.reason) : 'mode=live' }
  }, payload.concurrency || settings.concurrency, (site, result) => {
    checked += 1
    if (result.source === 'live') {
      reachable_count += 1
      const profile = result.live.profile
      if (profile) {
        profile.target = target
        profile.provenance = 'live'
        profile.site = result.site.host
        if (profile.found) {
          profiles.push(profile)
          live_found += 1
          jobs.log(job, '[LIVE] ' + result.site.host + ' → profile detected · rate ' + profile.rate + ' · ' + result.live.latency_ms + 'ms', 'hit', target)
        } else {
          cleared.push({ site: result.site.host, rank: result.site.rank, url: result.live.url, status: 'no-account', provenance: 'live' })
          jobs.log(job, '[LIVE] ' + result.site.host + ' → no account for "' + target + '" (' + result.live.status_code + ')', 'miss', target)
        }
      }
    } else if (result.source === 'challenge') {
      unreachable.push({ site: result.site.host, url: result.live.url, error: 'anti-bot interstitial', rank: result.site.rank, provenance: 'challenge' })
      jobs.log(job, '[CHALLENGE] ' + result.site.host + ' → anti-bot interstitial returned, no profile data readable', 'warn', target)
    } else if (result.source === 'synthetic') {
      const profile = result.synthesized.profile
      profile.target = target
      profile.site = result.synthesized.checked.site
      profile.checked = result.synthesized.checked
      if (profile.found) {
        profiles.push(profile)
        simulated_found += 1
        jobs.log(job, '[SANDBOX] ' + result.site.host + ' → ' + profile.status + ' · ' + profile.rate + ' · ' + (result.live_error || 'source unreachable'), 'sim', target)
      } else {
        cleared.push(Object.assign({}, result.synthesized.checked, { status: 'no-account' }))
        jobs.log(job, '[SANDBOX] ' + result.site.host + ' → no account (simulated)', 'sim-miss', target)
      }
    } else {
      unreachable.push({ site: result.site.host, url: result.site.url_template.replace('{username}', target), error: result.live_error, rank: result.site.rank })
      jobs.log(job, '[BLOCKED] ' + result.site.host + ' → ' + (result.live_error || 'unreachable') + ' (source dropped, no fallback enabled)', 'warn', target)
    }
    jobs.progress(job, {
      checked,
      live: reachable_count,
      blocked: checked - reachable_count,
      found: profiles.length,
      percent: Math.round((checked / Math.max(total, 1)) * 100)
    })
  })

  profiles.sort((a, b) => (Number(String(b.rate || '0').replace('%', '')) || 0) - (Number(String(a.rate || '0').replace('%', '')) || 0))

  // live first-party enrichment through the verified connectors
  let live_identity = null
  if (live_enrich) {
    jobs.progress(job, { stage: 'verify' })
    jobs.log(job, 'Verifying identity anchors on first-party APIs (GitHub / PyPI / npm)...', 'stage', target)
    try {
      live_identity = await connectors.enrich_identity(target, { token: settings.github_token, deep: settings.deep_enrich, limit: 20 })
      const matched = live_identity.matched_connectors
      jobs.log(job, matched.length ? 'Verified live anchors: ' + matched.join(', ') : 'No first-party anchor matched for this handle', matched.length ? 'hit' : 'miss', target)
    } catch (err) {
      jobs.log(job, 'Connector enrichment failed: ' + (err.message || err), 'warn', target)
    }
  }

  let identity_intel = null
  const want_identity = payload.identity_analysis !== undefined ? payload.identity_analysis : settings.identity_analysis
  if (want_identity) {
    jobs.progress(job, { stage: 'identity' })
    try {
      const req = { body: { string: target, uuid: job.id, option: '' } }
      const [origins, all_words] = await Promise.all([
        nameAnalysis.find_origins(req).catch(() => []),
        Promise.resolve({ prefix: [], name: [], number: [], symbol: [], unknown: [], maybe: [] })
      ])
      await stringAnalysis.find_symbols(req, all_words).catch(() => null)
      await stringAnalysis.find_numbers(req, all_words).catch(() => null)
      await stringAnalysis.split_upper_case(req, all_words).catch(() => null)
      await stringAnalysis.split_alphabet_case(req, all_words).catch(() => null)
      await stringAnalysis.analyze_string(req, all_words).catch(() => null)
      await stringAnalysis.get_maybe_words(req, all_words).catch(() => null)
      const ages = await stringAnalysis.guess_age_from_string(req).catch(() => [])
      identity_intel = {
        origins: origins.slice(0, 12),
        tokens: all_words,
        ages
      }
    } catch (err) {
      identity_intel = null
    }
  }

  const status_counts = { good: 0, maybe: 0, bad: 0 }
  profiles.forEach(profile => { status_counts[profile.status] = (status_counts[profile.status] || 0) + 1 })

  const by_category = tally(profiles, 'type')
  const by_country = tally(profiles, 'country').filter(item => item.name !== 'Unspecified')
  const stats = {
    status_counts,
    rating_histogram: detection_histogram(profiles),
    by_category,
    by_country,
    ns_flags: profiles.filter(profile => profile.type === 'Adult').length,
    avg_rate: profiles.length ? Number((profiles.reduce((sum, profile) => sum + (Number(String(profile.rate || '0').replace('%', '')) || 0), 0) / profiles.length).toFixed(1)) : 0
  }

  const score = synthesis.exposure_score(profiles, total)
  const band = synthesis.exposure_band(score)

  return {
    target,
    identity: Object.assign({}, identity, { intel: identity_intel }),
    profiles,
    cleared,
    unreachable,
    live_identity,
    stats,
    exposure: Object.assign({ score }, band),
    coverage: {
      requested: total,
      reachable: reachable_count,
      blocked: total - reachable_count,
      coverage_percent: Number(((reachable_count / Math.max(total, 1)) * 100).toFixed(1)),
      live_findings: live_found,
      simulated_findings: simulated_found
    },
    graph: build_graph(target, profiles, live_identity)
  }
}

function case_notes (targets_detail, pool, payload) {
  const notes = []
  const reach = targets_detail.reduce((sum, detail) => sum + detail.coverage.reachable, 0)
  const blocked = targets_detail.reduce((sum, detail) => sum + detail.coverage.blocked, 0)
  const synthetic = targets_detail.reduce((sum, detail) => sum + detail.coverage.simulated_findings, 0)
  if (reach > 0) {
    notes.push(reach + ' live response(s) captured - those findings were produced by the real detection engine reading the actual page.')
  }
  if (blocked > 0) {
    notes.push(blocked + ' source check(s) could not complete from this deployment. Typical causes: egress allow-list, proxy requirement, DNS filtering, regional block or rate limiting.')
  }
  if (synthetic > 0) {
    notes.push(synthetic + ' finding(s) are sandbox fixtures (clearly badged "sandbox" in the console and tagged provenance:"synthetic" in exports). They exist so the workflow can be evaluated offline - they are not evidence. Configure a proxy in Settings or run the app on a host with open egress to obtain real results for those sources.')
  }
  notes.push('Detection rating: 0-100 (no / maybe / yes) produced by the upstream multi-technique rating engine over ' + pool.sites.length + ' selected sources.')
  notes.push('Requested surface: ' + pool.requested + ' sources matched the selection, ' + pool.sites.length + ' were prioritised by global rank for this run.')
  if (payload.include_nsfw) notes.push('Adult sources were included in this run.')
  return notes
}

async function perform_scan (job, payload) {
  const started = Date.now()
  const targets = String(payload.targets || payload.target || '')
    .split(',')
    .map(item => item.trim().replace(/^@/, ''))
    .filter(Boolean)
    .slice(0, 6)
  if (!targets.length) throw new Error('At least one target handle is required.')

  const pool = resolve_sites(payload)
  if (!pool.sites.length) throw new Error('No sources selected - pick at least one platform.')

  jobs.log(job, APP_NAME + ' investigation started · ' + targets.length + ' target(s) · ' + pool.sites.length + ' sources · mode: ' + (payload.mode || settings.mode), 'stage')
  jobs.log(job, 'Detection database: ' + SITES.length + ' platforms / ' + DETECTION_COUNT + ' detection techniques loaded from data/sites.json', 'info')
  jobs.emit(job, 'meta', { targets, sites: pool.sites.length, mode: normalize_mode(payload.mode || settings.mode), requested: pool.requested })

  const targets_detail = []
  for (const target of targets) {
    if (job.cancel_requested) break
    targets_detail.push(await investigate_target(target, pool, { job, payload, live_enrich: payload.deep_enrich !== false }))
  }

  const profiles = targets_detail.flatMap(detail => detail.profiles)
  const live_findings = profiles.filter(profile => profile.provenance === 'live').length
  const simulated_findings = profiles.filter(profile => profile.provenance === 'synthetic').length
  const high_confidence = profiles.filter(profile => Number(String(profile.rate || '0').replace('%', '')) >= 100).length
  const reachable = targets_detail.reduce((sum, detail) => sum + detail.coverage.reachable, 0)
  const blocked = targets_detail.reduce((sum, detail) => sum + detail.coverage.blocked, 0)
  const score = profiles.length ? Math.round(targets_detail.reduce((sum, detail) => sum + detail.exposure.score, 0) / targets_detail.length) : 0
  const band = synthesis.exposure_band(score)

  const case_id = 'HHA-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const case_object = {
    id: case_id,
    status: 'complete',
    created_at: Date.now(),
    duration_ms: Date.now() - started,
    target_handles: targets,
    targets,
    mode: normalize_mode(payload.mode || settings.mode),
    operator: payload.operator || settings.operator,
    provenance: simulated_findings === 0 ? 'live' : (live_findings > 0 ? 'mixed' : 'synthetic'),
    coverage: {
      sources_requested: pool.requested,
      sources_scanned: pool.sites.length,
      reachable,
      blocked,
      coverage_percent: Number(((reachable / Math.max(reachable + blocked, 1)) * 100).toFixed(1)),
      live_findings,
      simulated_findings
    },
    summary: Object.assign({
      sites_checked: pool.sites.length,
      profiles_found: profiles.length,
      live_findings,
      simulated_findings,
      high_confidence,
      targets: targets.length,
      exposure_score: score,
      coverage_percent: Number(((reachable / Math.max(reachable + blocked, 1)) * 100).toFixed(1))
    }, band),
    selection: {
      presets: payload.presets || (payload.preset ? [payload.preset] : []),
      top: payload.top || 0,
      sites: pool.sites.map(site => ({ index: site.index, host: site.host, category: site.category, rank: site.rank }))
    },
    engine: {
      name: ENGINE_NAME,
      version: ENGINE_VERSION,
      detection_level: helper.detection_level.current,
      sites_in_database: SITES.length,
      detection_techniques: DETECTION_COUNT,
      max_retries: 3,
      workers: payload.concurrency || settings.concurrency
    },
    settings_snapshot: {
      per_site_timeout_ms: payload.per_site_timeout_ms || settings.per_site_timeout_ms,
      concurrency: payload.concurrency || settings.concurrency,
      proxy_configured: !!settings.proxy,
      github_token_configured: !!settings.github_token,
      metadata: settings.metadata,
      extraction: settings.extraction,
      identity_analysis: settings.identity_analysis,
      allow_synthetic: payload.allow_synthetic !== undefined ? payload.allow_synthetic : settings.allow_synthetic
    },
    targets_detail,
    profiles,
    notes: case_notes(targets_detail, pool, payload)
  }

  jobs.progress(job, { stage: 'compiling', percent: 99 })
  jobs.log(job, 'Compiling case file · ' + profiles.length + ' profile record(s) · exposure score ' + score + '/100 (' + band.label + ')', 'stage')
  const saved = cases.save_case(case_object)
  jobs.progress(job, { stage: 'sealed', percent: 100 })
  jobs.log(job, 'Case ' + saved.id + ' sealed and stored (' + (saved.summary ? 'runtime/cases' : '') + ')', 'stage')
  return saved
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

const router = express.Router()

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

router.get('/health', async (req, res) => {
  const probes = probe_cache
  if (!probes.results.length) {
    // warm the cache in the background: a cold probe run must not delay first paint
    run_probes().catch(() => {})
  }
  res.json({
    app: APP_NAME,
    tagline: APP_TAGLINE,
    status: 'online',
    time: Date.now(),
    uptime_s: Math.round(process.uptime()),
    node: process.version,
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, detection_level: helper.detection_level.current },
    database: { sites: SITES.length, detections: DETECTION_COUNT, categories: new Set(SITES.map(site => site.category)).size, countries: new Set(SITES.map(site => site.country)).size },
    connectors: connectors.CONNECTORS,
    egress: probes.summary ? Object.assign({}, probes.summary, { hosts: probes.results.map(item => ({ host: item.host, ok: item.ok, status: item.status, latency_ms: item.latency_ms, reason: item.reason })) }) : null,
    cases: cases.stats(),
    settings: public_settings()
  })
})

router.get('/sites', (req, res) => {
  const search = String(req.query.search || '').toLowerCase()
  const category = String(req.query.category || '')
  const country = String(req.query.country || '')
  const nsfw = String(req.query.nsfw || 'include')
  const connector = String(req.query.connector || '')
  const sort = String(req.query.sort || 'rank')
  const limit = Math.min(Number(req.query.limit) || 300, 1200)

  let list = SITES.slice()
  if (search) list = list.filter(site => site.host.includes(search) || site.category.toLowerCase().includes(search))
  if (category) list = list.filter(site => site.category === category)
  if (country) list = list.filter(site => site.country === country)
  if (nsfw === 'exclude') list = list.filter(site => !site.nsfw)
  if (nsfw === 'only') list = list.filter(site => site.nsfw)
  if (connector) list = list.filter(site => CONNECTOR_HOSTS.includes(site.host))
  if (sort === 'rank') list.sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER))
  else if (sort === 'name') list.sort((a, b) => a.host.localeCompare(b.host))
  else if (sort === 'category') list.sort((a, b) => a.category.localeCompare(b.category))

  res.json({
    total: list.length,
    returned: Math.min(list.length, limit),
    connector_hosts: CONNECTOR_HOSTS,
    categories: Array.from(new Set(SITES.map(site => site.category))).sort(),
    countries: Array.from(new Set(SITES.map(site => site.country))).sort(),
    sites: list.slice(0, limit).map(site => Object.assign({}, site, { live_connector: CONNECTOR_HOSTS.includes(site.host) }))
  })
})

router.get('/facets', (req, res) => {
  const by_category = {}
  const by_country = {}
  SITES.forEach(site => {
    by_category[site.category] = (by_category[site.category] || 0) + 1
    by_country[site.country] = (by_country[site.country] || 0) + 1
  })
  res.json({
    categories: Object.entries(by_category).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    countries: Object.entries(by_country).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    ranked: ranked_sites().slice(0, 30).map(site => ({ host: site.host, rank: site.rank, category: site.category }))
  })
})

router.get('/presets', (req, res) => {
  res.json({ presets: PRESETS.map(preset => ({ id: preset.id, label: preset.label, description: preset.description, kind: preset.kind, count: preset.sites.length })) })
})

router.get('/probe', async (req, res) => {
  const force = String(req.query.force || '') === '1'
  const probes = await run_probes(force)
  res.json({ summary: probes.summary, results: probes.results, cached_for_s: Math.round(PROBE_TTL_MS / 1000) })
})

router.post('/scan/preview', (req, res) => {
  const payload = req.body || {}
  const pool = resolve_sites(payload)
  const connectorsSelected = pool.sites.filter(site => CONNECTOR_HOSTS.includes(site.host))
  res.json({
    targets: String(payload.targets || payload.target || '').split(',').map(item => item.trim()).filter(Boolean).length,
    sources: pool.sites.length,
    matched: pool.requested,
    limit: pool.limit,
    first_party_sources: connectorsSelected.length,
    estimated_seconds: Math.max(3, Math.round((pool.sites.length / Math.max(1, payload.concurrency || settings.concurrency)) * ((payload.per_site_timeout_ms || settings.per_site_timeout_ms) / 1000) * 0.55)),
    mode: payload.mode || settings.mode,
    sample: pool.sites.slice(0, 12).map(site => ({ host: site.host, rank: site.rank, category: site.category }))
  })
})

router.post('/scan', (req, res) => {
  const payload = Object.assign({}, req.body || {})
  const job = jobs.create_job({ targets: payload.targets || payload.target, mode: normalize_mode(payload.mode || settings.mode), operator: payload.operator || settings.operator })
  jobs.progress(job, { stage: 'queued' })
  res.json({ job: job.id, status: job.status, stream: '/api/stream/' + job.id })
  perform_scan(job, payload)
    .then(case_object => jobs.finish(job, { case_id: case_object.id, summary: case_object.summary, coverage: case_object.coverage }))
    .catch(err => {
      jobs.log(job, 'Investigation failed: ' + (err.message || err), 'error')
      jobs.fail(job, err)
    })
})

router.post('/scan/:id/cancel', (req, res) => {
  const job = jobs.get_job(req.params.id)
  if (!job) return res.status(404).json({ error: 'unknown job' })
  jobs.cancel(job)
  res.json({ cancelled: true, job: job.id })
})

router.get('/stream/:id', (req, res) => {
  const job = jobs.get_job(req.params.id)
  if (!job) return res.status(404).json({ error: 'unknown job' })
  jobs.subscribe(job, req, res)
})

router.get('/jobs', (req, res) => res.json({ jobs: jobs.list_jobs().slice(-25).reverse() }))

/* ------------------------------ cases ------------------------------ */

router.get('/cases', (req, res) => res.json({ cases: cases.list_cases(), stats: cases.stats() }))

router.get('/cases/:id', (req, res) => {
  const case_object = cases.get_case(req.params.id)
  if (!case_object) return res.status(404).json({ error: 'case not found' })
  res.json(case_object)
})

router.delete('/cases/:id', (req, res) => {
  const removed = cases.remove_case(req.params.id)
  res.json({ removed, id: req.params.id })
})

router.delete('/cases', (req, res) => res.json({ removed: cases.clear_cases() }))

router.get('/cases/:id/export', (req, res) => {
  const case_object = cases.get_case(req.params.id)
  if (!case_object) return res.status(404).json({ error: 'case not found' })
  const format = String(req.query.format || 'json')
  const filename = case_object.id + (format === 'csv' ? '.csv' : format === 'md' ? '.md' : '.json')
  if (format === 'csv') {
    const header = ['target', 'source', 'platform', 'url', 'status', 'rate', 'confidence', 'category', 'country', 'rank', 'provenance', 'title']
    const rows = case_object.profiles.map(profile => [
      profile.target, profile.site, profile.site, profile.link, profile.status, profile.rate,
      profile.confidence || '', profile.type, profile.country, profile.rank, profile.provenance, (profile.title || '').replace(/"/g, "'")
    ])
    const csv = [header].concat(rows).map(row => row.map(value => '"' + String(value === undefined || value === null ? '' : value) + '"').join(',')).join('\n')
    res.set('Content-Type', 'text/csv')
    res.set('Content-Disposition', 'attachment; filename="' + filename + '"')
    return res.send(csv)
  }
  if (format === 'md') {
    res.set('Content-Type', 'text/markdown')
    res.set('Content-Disposition', 'attachment; filename="' + filename + '"')
    return res.send(case_to_markdown(case_object))
  }
  res.set('Content-Type', 'application/json')
  res.set('Content-Disposition', 'attachment; filename="' + filename + '"')
  res.send(JSON.stringify(case_object, null, 2))
})

function case_to_markdown (case_object) {
  const lines = []
  lines.push('# ' + APP_NAME + ' - Investigation Report')
  lines.push('')
  lines.push('**Case:** ' + case_object.id + '  ')
  lines.push('**Generated:** ' + new Date(case_object.created_at).toISOString() + '  ')
  lines.push('**Targets:** ' + case_object.targets.join(', ') + '  ')
  lines.push('**Mode:** ' + case_object.mode + '  ')
  lines.push('**Provenance:** ' + case_object.provenance + '  ')
  lines.push('**Runner:** ' + case_object.engine.name + ' ' + case_object.engine.version + ' (' + case_object.engine.detection_techniques + ' detection techniques / ' + case_object.engine.sites_in_database + ' platforms)')
  lines.push('')
  lines.push('## Executive summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('| --- | --- |')
  lines.push('| Exposure score | ' + case_object.summary.exposure_score + '/100 (' + case_object.summary.label + ') |')
  lines.push('| Sources scanned | ' + case_object.summary.sites_checked + ' |')
  lines.push('| Profiles catalogued | ' + case_object.summary.profiles_found + ' |')
  lines.push('| Live findings | ' + case_object.summary.live_findings + ' |')
  lines.push('| Sandbox findings | ' + case_object.summary.simulated_findings + ' |')
  lines.push('| Coverage | ' + case_object.summary.coverage_percent + '% |')
  lines.push('')
  lines.push('## Findings')
  lines.push('')
  lines.push('| Platform | Status | Rating | Category | Country | Rank | Provenance | URL |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  case_object.profiles.forEach(profile => {
    lines.push('| ' + profile.site + ' | ' + profile.status + ' | ' + profile.rate + ' | ' + profile.type + ' | ' + profile.country + ' | ' + profile.rank + ' | ' + profile.provenance + ' | ' + profile.link + ' |')
  })
  lines.push('')
  lines.push('## Analyst notes')
  lines.push('')
  case_object.notes.forEach(note => lines.push('- ' + note))
  lines.push('')
  lines.push('_' + APP_NAME + ' - ' + APP_TAGLINE + '. Live findings are collected from public pages by the open-source social-analyzer engine. Sandbox findings are offline fixtures and are not evidence._')
  return lines.join('\n')
}

/* ---------------------------- settings ---------------------------- */

router.get('/settings', (req, res) => res.json(public_settings()))

router.post('/settings', (req, res) => {
  const patch = Object.assign({}, req.body || {})
  if (patch.github_token && /^•+/.test(patch.github_token)) delete patch.github_token
  if (patch.selected_sites && !Array.isArray(patch.selected_sites)) delete patch.selected_sites
  delete patch.has_github_token
  res.json(public_settings(save_settings(patch)))
})

/* --------------------------- connectors --------------------------- */

router.get('/connectors', (req, res) => res.json({ connectors: connectors.CONNECTORS }))

router.post('/lookup/:handle', async (req, res) => {
  const handle = String(req.params.handle || '').replace(/^@/, '').trim()
  if (!handle) return res.status(400).json({ error: 'handle required' })
  try {
    const result = await connectors.enrich_identity(handle, { token: settings.github_token, deep: settings.deep_enrich, limit: Number(req.body && req.body.limit) || 12 })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

router.get('/identity/:handle', async (req, res) => {
  const handle = String(req.params.handle || '')
  const req_obj = { body: { string: handle, uuid: 'identity', option: '' } }
  const all_words = { prefix: [], name: [], number: [], symbol: [], unknown: [], maybe: [] }
  try {
    await stringAnalysis.find_symbols(req_obj, all_words)
    await stringAnalysis.find_numbers(req_obj, all_words)
    await stringAnalysis.split_upper_case(req_obj, all_words)
    await stringAnalysis.split_alphabet_case(req_obj, all_words)
    await stringAnalysis.analyze_string(req_obj, all_words)
    await stringAnalysis.get_maybe_words(req_obj, all_words)
    const ages = await stringAnalysis.guess_age_from_string(req_obj)
    const origins = await nameAnalysis.find_origins(req_obj)
    res.json({
      handle,
      archetype: synthesis.classify_identity(handle),
      tokens: all_words,
      ages,
      origins: origins.slice(0, 20)
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/* --------------------------- scan stats --------------------------- */

router.get('/overview', (req, res) => {
  res.json({
    app: APP_NAME,
    tagline: APP_TAGLINE,
    database: { sites: SITES.length, detections: DETECTION_COUNT, categories: new Set(SITES.map(site => site.category)).size, countries: new Set(SITES.map(site => site.country)).size, ranked: ranked_sites().length, nsfw: SITES.filter(site => site.nsfw).length },
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, detection_level: helper.detection_level.current, max_retries: 3, default_workers: settings.concurrency },
    connectors: connectors.CONNECTORS,
    presets: PRESETS.map(preset => ({ id: preset.id, label: preset.label, count: preset.sites.length, kind: preset.kind, description: preset.description })),
    cases: cases.stats(),
    top_sources: ranked_sites().slice(0, 12).map(site => ({ host: site.host, rank: site.rank, category: site.category, country: site.country })),
    stats: (() => {
      const index = cases.list_cases()
      const series = []
      for (let day = 13; day >= 0; day--) {
        const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - day)
        const end = new Date(start); end.setDate(end.getDate() + 1)
        const day_cases = index.filter(item => item.created_at >= start.getTime() && item.created_at < end.getTime())
        series.push({ date: start.toISOString().slice(0, 10), cases: day_cases.length, findings: day_cases.reduce((sum, item) => sum + ((item.summary && item.summary.profiles_found) || 0), 0) })
      }
      return { activity: series }
    })()
  })
})

router.get('/dashboard', (req, res) => {
  const index = cases.list_cases()
  const recent = index.slice(0, 6)
  const score_series = index.slice(0, 30).reverse().map(item => ({ id: item.id, at: item.created_at, score: (item.summary && item.summary.exposure_score) || 0 }))
  res.json({ cases: recent, score_series, stats: cases.stats() })
})

/* ------------------------------ meta ------------------------------ */

function attach (app) {
  app.use('/api', router)
  return app
}

load_settings()

export default {
  attach,
  router,
  APP_NAME,
  APP_TAGLINE,
  ENGINE_NAME,
  ENGINE_VERSION,
  SITES,
  PRESETS,
  settings,
  save_settings,
  public_settings,
  run_probes,
  case_to_markdown,
  CONNECTORS: connectors.CONNECTORS
}
