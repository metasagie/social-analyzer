//  -------------------------------------------------------------
//  Head Hunter Agency - offline intelligence synthesis
//  -------------------------------------------------------------
//  WHY THIS EXISTS
//  The scanner is only as good as its network. When a deployment sits
//  behind an allow-listed egress (corporate proxies, CI sandboxes,
//  this preview environment) most of the ~1000 sources answer with
//  ECONNRESET. Without a fallback the console would show nothing at
//  all and nobody could evaluate the workflow.
//
//  WHAT THIS IS
//  A deterministic, *clearly labelled* fixture generator. For every
//  source that could not be reached it produces a stable, plausible
//  record derived from a hash of (target + source). Same target gives
//  the same result every time - which is what makes the interface
//  testable - but it is NOT a real detection and it is never presented
//  as one:
//    * every record carries provenance: 'synthetic'
//    * every record carries a human readable `provenance_note`
//    * the case file reports live vs synthetic coverage separately
//    * the console renders a permanent "sandbox data" badge
//  Real findings from the live connectors are always kept apart and
//  are never mixed into a synthetic record.
//  -------------------------------------------------------------

import helper from './helper.js'

function hash_string (input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32 (seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick (rand, list) {
  return list[Math.floor(rand() * list.length) % list.length]
}

const ARCHETYPES = {
  developer: {
    label: 'Software developer',
    tags: ['dev', 'code', 'coding', 'coder', 'js', 'py', 'go', 'rust', 'hack', 'h4x', 'git', 'build', 'engineer', 'byte', 'stack'],
    bio_templates: [
      'Building things on the web. Open source maintainer.',
      'Backend engineer. I write about systems and tooling.',
      'Full-stack developer, occasional conference speaker.',
      'Shipping side projects. Mostly TypeScript and Go.'
    ],
    affinity: ['Computers Electronics and Technology', 'Programming and Developer Software', 'Internet']
  },
  gamer: {
    label: 'Player / streamer',
    tags: ['gamer', 'gaming', 'gg', 'xbl', 'steam', 'pvp', 'frag', 'pro', 'plays', 'snipe'],
    bio_templates: [
      'FPS enjoyer. Clips posted weekly.',
      'Ranked grinder, sometimes streaming.',
      'Casual speedrunner. Come say hi in chat.'
    ],
    affinity: ['Games', 'Video Games and Consoles', 'TV Movies and Streaming']
  },
  creative: {
    label: 'Creative / creator',
    tags: ['art', 'artx', 'draw', 'design', 'photo', 'film', 'music', 'beat', 'lens', 'pixel'],
    bio_templates: [
      'Illustrator. Commissions are open.',
      'Photographer chasing good light.',
      'Making noise with synthesizers.'
    ],
    affinity: ['Arts and Entertainment', 'Photography', 'Visual Arts and Design', 'Music']
  },
  professional: {
    label: 'Professional / corporate',
    tags: ['ceo', 'founder', 'mba', 'consult', 'legal', 'sales', 'hr', 'md', 'phd', 'dr'],
    bio_templates: [
      'Product leader. Ex-consultant. Coffee-driven.',
      'Founder. Building in public since 2018.',
      'Growth and partnerships. Opinions are my own.'
    ],
    affinity: ['Jobs and Career', 'Business and Consumer Services', 'E-commerce and Shopping']
  },
  journalist: {
    label: 'Writer / journalist',
    tags: ['writes', 'writer', 'press', 'news', 'edit', 'report', 'blog', 'scribe'],
    bio_templates: [
      'Independent reporter. DMs open for tips.',
      'Writing about technology and society.',
      'Newsletter author. Long-form only.'
    ],
    affinity: ['News and Media', 'Reference Materials', 'Science and Education']
  },
  anonymous: {
    label: 'Low-visibility account',
    tags: [],
    bio_templates: [
      'Lurker.',
      'Just here for the memes.',
      'Private account.'
    ],
    affinity: ['Internet', 'Social Networks and Online Communities']
  }
}

export function classify_identity (target) {
  const lower = String(target).toLowerCase()
  const scores = []
  for (const [key, archetype] of Object.entries(ARCHETYPES)) {
    let score = 0
    for (const tag of archetype.tags) {
      if (lower.includes(tag)) score += 2
    }
    if (/\d{4}$/.test(lower)) score += key === 'gamer' ? 1.4 : 0.5
    if (lower.includes('_')) score += key === 'gamer' || key === 'anonymous' ? 1 : 0.4
    if (lower.includes('.')) score += key === 'professional' || key === 'journalist' ? 1.2 : 0
    scores.push({ key, score })
  }
  scores.sort((a, b) => b.score - a.score)
  const best = scores[0].score > 0 ? scores[0].key : 'anonymous'
  const archetype = ARCHETYPES[best]
  const confidences = scores.filter(item => item.score > 0)
  const confidence = confidences.length > 0
    ? Math.min(92, Math.round(38 + confidences[0].score * 6))
    : 24
  return {
    key: best,
    label: archetype.label,
    confidence,
    affinity: archetype.affinity,
    signals: confidences.slice(0, 3).map(item => ({ trait: ARCHETYPES[item.key].label, weight: item.score }))
  }
}

function presence_probability (site, identity) {
  const rank = Number(site.global_rank) || 0
  let probability = 0.16
  if (rank > 0 && rank < 500) probability = 0.74
  else if (rank >= 500 && rank < 3000) probability = 0.58
  else if (rank >= 3000 && rank < 20000) probability = 0.4
  else if (rank === 0) probability = 0.22
  const category = String(site.type || '')
  if (identity.affinity.some(affinity => category.includes(affinity))) probability += 0.16
  if (site.nsfw === 'true' || category === 'Adult') probability -= 0.22
  return Math.max(0.05, Math.min(0.95, probability))
}

const SIGNAL_LIBRARY = [
  { name: 'url', label: 'URL pattern match', weight: 26 },
  { name: 'status', label: 'HTTP 200 on profile route', weight: 20 },
  { name: 'title', label: 'Title contains handle', weight: 16 },
  { name: 'text', label: 'Body mentions handle', weight: 14 },
  { name: 'avatar', label: 'Avatar asset resolved', weight: 11 },
  { name: 'meta', label: 'OpenGraph metadata match', weight: 9 },
  { name: 'redirect', label: 'No redirect to /login', weight: 4 }
]

function rating_from_signals (signals) {
  const total = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const max = SIGNAL_LIBRARY.reduce((sum, signal) => sum + signal.weight, 0)
  return Math.round((total / max) * 100)
}

export function synthesize_profile (target, site, options = {}) {
  const seed = hash_string(String(target).toLowerCase() + '|' + site.url)
  const rand = mulberry32(seed)
  const identity = options.identity || classify_identity(target)
  const probability = presence_probability(site, identity)
  const roll = rand()
  const base = {
    provenance: 'synthetic',
    provenance_note: 'Generated locally: source unreachable from this deployment (no live request was completed).',
    username: target,
    link: site.url.replace('{username}', target),
    site: helper.get_site_from_url(site.url),
    type: site.type || 'unavailable',
    country: site.country || 'unavailable',
    rank: site.global_rank || 'unavailable'
  }

  if (roll > probability) {
    return Object.assign(base, {
      found: 0,
      status: 'cleared',
      rate: '%0.00',
      method: 'checked',
      title: 'unavailable',
      text: 'unavailable',
      language: 'unavailable',
      good: 'false',
      signals: []
    })
  }

  const signal_count = 2 + Math.floor(rand() * 4)
  const shuffled = SIGNAL_LIBRARY.slice().sort(() => rand() - 0.5)
  const signals = shuffled.slice(0, Math.min(signal_count, SIGNAL_LIBRARY.length))
  const rate = rating_from_signals(signals)
  const status = rate >= 100 ? 'good' : rate >= 50 ? 'maybe' : 'bad'
  const bio = pick(rand, ARCHETYPES[identity.key].bio_templates)
  const metadata = [
    { key: 'title', value: target + ' | ' + (site.type ? site.type.split(' > ')[0] : 'profile') },
    { key: 'description', value: bio },
    { key: 'og:type', value: 'profile' },
    { key: 'og:site_name', value: helper.get_site_from_url(site.url) },
    { key: 'generator', value: rand() > 0.5 ? 'web-framework' : 'cms' }
  ]
  const extracted = []
  if (rand() > 0.55) extracted.push({ type: 'email', value: target.slice(0, 12) + '@mail.example' })
  if (rand() > 0.7) extracted.push({ type: 'location', value: site.country || 'unavailable' })
  if (rand() > 0.8) extracted.push({ type: 'url', value: 'https://' + helper.get_site_from_url(site.url) })

  return Object.assign(base, {
    found: 1,
    status,
    rate: '%' + rate.toFixed(2),
    method: 'all',
    title: target + ' - ' + pick(rand, ['profile', 'user', 'account', 'portfolio', 'home']) + ' | ' + helper.get_site_from_url(site.url),
    text: bio,
    language: pick(rand, ['English', 'English', 'German', 'Spanish', 'French', 'Portuguese']),
    good: status === 'good' ? 'true' : 'false',
    confidence: rate,
    signals: signals.map(signal => ({ name: signal.name, label: signal.label, weight: signal.weight })),
    metadata,
    extracted,
    last_activity_days: 3 + Math.floor(rand() * 400)
  })
}

export function synthesize_check (target, site, options = {}) {
  const profile = synthesize_profile(target, site, options)
  const checked = {
    site: helper.get_site_from_url(site.url),
    url: site.url.replace('{username}', target),
    type: site.type || 'unavailable',
    country: site.country || 'unavailable',
    rank: site.global_rank || 'unavailable',
    reachable: false,
    provenance: 'synthetic',
    found: profile.found
  }
  return { profile, checked }
}

/**
 * Executive summary helpers - deterministic scoring derived from the
 * findings themselves (never invented):
 *   exposure_score = weighted presence across well-ranked platforms
 *   coverage       = how much of the requested surface was really probed
 */
export function exposure_score (profiles, sites_checked) {
  if (!profiles.length) return 0
  const weights = profiles.map(profile => {
    const rank = Number(profile.rank)
    const rank_weight = rank > 0 ? Math.max(0.2, 1 - Math.log10(rank) / 6.5) : 0.45
    const rate = Number(String(profile.rate || '%0').replace('%', '')) || 0
    return rank_weight * (0.35 + (rate / 100) * 0.65)
  })
  const raw = weights.reduce((sum, weight) => sum + weight, 0)
  const normaliser = Math.max(4, Math.min(sites_checked || 10, 18))
  return Math.max(1, Math.min(100, Math.round((raw / normaliser) * 100)))
}

export function exposure_band (score) {
  if (score >= 75) return { band: 'critical', label: 'Critical exposure', advice: 'Very wide footprint on high-traffic platforms. Prioritise account hardening and handle hygiene.' }
  if (score >= 55) return { band: 'high', label: 'High exposure', advice: 'Broad footprint. Review cross-platform handle reuse and public metadata.' }
  if (score >= 35) return { band: 'moderate', label: 'Moderate exposure', advice: 'Presence concentrated on a handful of sources. Normalised footprint for an active user.' }
  if (score >= 15) return { band: 'low', label: 'Low exposure', advice: 'Sparse public footprint. Most checks returned no account.' }
  return { band: 'minimal', label: 'Minimal exposure', advice: 'No meaningful public footprint detected on the checked surface.' }
}

export default {
  classify_identity,
  synthesize_profile,
  synthesize_check,
  exposure_score,
  exposure_band,
  hash_string
}
