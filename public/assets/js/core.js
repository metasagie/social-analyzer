/* Head Hunter Agency — core utilities, API client, charts, UI atoms */

/* ------------------------------------------------------------------ state */

export const store = {
  view: 'dashboard',
  overview: null,
  presets: [],
  settings: null,
  health: null,
  selection: { presets: new Set(['top25']), sites: new Set() },
  options: {
    mode: 'auto',
    maxSites: 36,
    timeout: 6000,
    concurrency: 14,
    allowSynthetic: true,
    includeNsfw: false,
    deepEnrich: true,
    metadata: true,
    extraction: true,
    identity: true
  },
  job: null,
  stream: null,
  currentCase: null,
  cases: [],
  sites: [],
  facets: null,
  probe: null,
  console: { lines: [], lastTarget: '', running: false }
}

/* -------------------------------------------------------------------- api */

async function request (method, url, body) {
  const options = { method, headers: {} }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch (err) { data = text }
  if (!res.ok) {
    const message = (data && data.error) ? data.error : ('HTTP ' + res.status)
    throw new Error(message)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  del: (url) => request('DELETE', url),
  health: () => request('GET', '/api/health'),
  overview: () => request('GET', '/api/overview'),
  presets: () => request('GET', '/api/presets'),
  sites: (query = '') => request('GET', '/api/sites' + query),
  facets: () => request('GET', '/api/facets'),
  probe: (force) => request('GET', '/api/probe' + (force ? '?force=1' : '')),
  preview: (payload) => request('POST', '/api/scan/preview', payload),
  scan: (payload) => request('POST', '/api/scan', payload),
  cancel: (job) => request('POST', '/api/scan/' + job + '/cancel', {}),
  cases: () => request('GET', '/api/cases'),
  case_: (id) => request('GET', '/api/cases/' + id),
  deleteCase: (id) => request('DELETE', '/api/cases/' + id),
  settings: () => request('GET', '/api/settings'),
  saveSettings: (patch) => request('POST', '/api/settings', patch),
  lookup: (handle) => request('POST', '/api/lookup/' + encodeURIComponent(handle), {}),
  identity: (handle) => request('GET', '/api/identity/' + encodeURIComponent(handle))
}

export function stream (jobId, handlers) {
  const source = new EventSource('/api/stream/' + jobId)
  source.onmessage = (event) => {
    let payload
    try { payload = JSON.parse(event.data) } catch (err) { return }
    if (handlers[payload.type]) handlers[payload.type](payload)
    if (handlers.all) handlers.all(payload)
  }
  source.onerror = () => { if (handlers.onerror) handlers.onerror() }
  return source
}

/* -------------------------------------------------------------- formatting */

export function escape (value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function rateOf (profile) {
  const value = Number(String((profile && profile.rate) || '0').replace('%', ''))
  return Number.isFinite(value) ? value : 0
}

export function num (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value === undefined || value === null || value === '' ? '—' : String(value)
  return n.toLocaleString('en-US')
}

export function compact (value) {
  const n = Number(value) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export function timeAgo (timestamp) {
  if (!timestamp) return '—'
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return seconds + 's ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  return Math.round(hours / 24) + 'd ago'
}

export function clock (timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date()
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

export function duration (ms) {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return ms + ' ms'
  const seconds = ms / 1000
  if (seconds < 60) return seconds.toFixed(1) + ' s'
  const minutes = Math.floor(seconds / 60)
  return minutes + 'm ' + Math.round(seconds % 60) + 's'
}

export function statusClass (status) {
  if (status === 'good') return 'good'
  if (status === 'maybe') return 'maybe'
  if (status === 'bad') return 'bad'
  return 'neutral'
}

export function rateColor (rate) {
  if (rate >= 100) return 'var(--good)'
  if (rate >= 50) return 'var(--maybe)'
  return 'var(--bad)'
}

export function initials (value) {
  const clean = String(value || '?').replace(/[^a-zA-Z0-9]/g, '')
  return (clean.slice(0, 2) || '?')
}

/* ----------------------------------------------------------------- icon set */

export function icon (name, extra = '') {
  return '<svg ' + extra + ' aria-hidden="true"><use href="#i-' + name + '"></use></svg>'
}

/* -------------------------------------------------------------------- toast */

export function toast (type, title, body) {
  const host = document.getElementById('toasts')
  if (!host) return
  const el = document.createElement('div')
  const iconName = type === 'ok' ? 'check' : type === 'err' ? 'alert' : type === 'warn' ? 'warn' : 'info'
  el.className = 'toast ' + (type || '')
  el.innerHTML = icon(iconName) + '<div><div class="t-title">' + escape(title) + '</div>' +
    (body ? '<div class="t-body">' + escape(body) + '</div>' : '') + '</div>'
  host.appendChild(el)
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease, transform .3s ease'
    el.style.opacity = '0'
    el.style.transform = 'translateX(18px)'
    setTimeout(() => el.remove(), 320)
  }, type === 'err' ? 7000 : 4600)
}

/* -------------------------------------------------------------------- modal */

export function modal (title, bodyHtml, footHtml, options = {}) {
  const backdrop = document.getElementById('modal')
  backdrop.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
    '<div class="modal-head"><h2>' + escape(title) + '</h2><div style="margin-left:auto"></div>' +
    '<button class="icon-btn" data-close>' + icon('close') + '</button></div>' +
    '<div class="modal-body">' + bodyHtml + '</div>' +
    (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
    '</div>'
  backdrop.classList.add('on')
  backdrop.querySelectorAll('[data-close]').forEach(button => button.onclick = closeModal)
  backdrop.onclick = (event) => { if (event.target === backdrop) closeModal() }
  if (options.onMount) options.onMount(backdrop)
  return backdrop
}

export function closeModal () {
  const backdrop = document.getElementById('modal')
  backdrop.classList.remove('on')
  backdrop.innerHTML = ''
}

/* --------------------------------------------------------------- svg charts */

export function ring (percent, size = 132, stroke = 9) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const value = Math.max(0, Math.min(100, percent))
  const dash = (value / 100) * circumference
  const color = value >= 75 ? 'var(--bad)' : value >= 55 ? 'var(--maybe)' : value >= 35 ? 'var(--brass)' : 'var(--good)'
  return '<div class="score-ring" style="width:' + size + 'px;height:' + size + 'px">' +
    '<svg width="' + size + '" height="' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + radius + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="' + stroke + '"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + radius + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '"' +
    ' stroke-linecap="round" stroke-dasharray="' + dash + ' ' + circumference + '"/>' +
    '</svg><div class="val"><b>' + Math.round(value) + '</b><span>Exposure</span></div></div>'
}

export function sparkline (series, options = {}) {
  if (!series || !series.length) return ''
  const width = 320
  const height = options.height || 70
  const values = series.map(point => Number(point.value) || 0)
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => [index * step, height - (value / max) * (height - 12) - 6])
  const path = points.map((point, index) => (index === 0 ? 'M' : 'L') + point[0].toFixed(1) + ' ' + point[1].toFixed(1)).join(' ')
  const area = path + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z'
  const gradientId = 'sg' + Math.random().toString(36).slice(2, 7)
  return '<svg class="spark" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="rgba(216,169,84,.38)"/><stop offset="100%" stop-color="rgba(216,169,84,0)"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + gradientId + ')"/>' +
    '<path d="' + path + '" fill="none" stroke="var(--brass)" stroke-width="2" stroke-linejoin="round"/>' +
    (options.dots ? points.map(point => '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="2.6" fill="var(--brass-soft)"/>').join('') : '') +
    '</svg>'
}

export function barList (items, options = {}) {
  if (!items || !items.length) return '<div class="hint">No data yet.</div>'
  const max = Math.max(...items.map(item => item.count))
  return items.slice(0, options.limit || 8).map(item =>
    '<div class="bar-row"><div title="' + escape(item.name) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escape(item.name) + '</div>' +
    '<div class="bar-track"><div class="bar-fill ' + (options.alt ? 'alt' : '') + '" style="width:' + Math.max(4, (item.count / max) * 100).toFixed(1) + '%"></div></div>' +
    '<div class="bar-value">' + item.count + '</div></div>').join('')
}

export function forceGraph (graph) {
  if (!graph || !graph.nodes.length) return '<div class="empty">No graph data.</div>'
  const width = 900
  const height = 420
  const center = { x: width / 2, y: height / 2 }
  const nodes = graph.nodes.map(node => Object.assign({}, node))
  const targets = nodes.filter(node => node.type === 'target')
  const others = nodes.filter(node => node.type !== 'target')
  targets.forEach((node, index) => {
    node.x = center.x
    node.y = 60 + index * 40
    node.r = 22
  })
  const rings = { connector: 0.42, live: 0.72, synthetic: 0.92, linked: 0.6 }
  const counters = {}
  others.forEach(node => {
    const ringFactor = rings[node.type] || 0.8
    const total = others.filter(item => item.type === node.type).length
    counters[node.type] = (counters[node.type] || 0)
    const angle = (counters[node.type] / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
    counters[node.type] += 1
    const radiusX = (width / 2 - 60) * ringFactor
    const radiusY = (height / 2 - 40) * ringFactor
    node.x = center.x + Math.cos(angle) * radiusX
    node.y = center.y + Math.sin(angle) * radiusY + 20
    node.r = node.type === 'live' ? 13 : node.type === 'connector' ? 11 : node.type === 'linked' ? 10 : 7
  })
  const position = new Map(nodes.map(node => [node.id, node]))
  const colors = { target: '#f1d69a', live: '#5b8cff', connector: '#35d39a', linked: '#d8a954', synthetic: 'rgba(160,107,255,.75)' }
  const links = graph.links.map(link => {
    const from = position.get(link.source)
    const to = position.get(link.target)
    if (!from || !to) return ''
    return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) + '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) + '" stroke="rgba(255,255,255,.12)" stroke-width="' + (1 + Math.min(2.4, (link.value || 10) / 40)).toFixed(2) + '"/>'
  }).join('')
  const circles = nodes.map(node =>
    '<g><circle cx="' + node.x.toFixed(1) + '" cy="' + node.y.toFixed(1) + '" r="' + node.r + '" fill="' + (colors[node.type] || '#888') + '" fill-opacity="' + (node.type === 'synthetic' ? 0.5 : 0.92) + '" stroke="rgba(0,0,0,.4)"/>' +
    '<title>' + escape(node.label) + ' (' + node.type + ')</title></g>' +
    (node.type !== 'synthetic' || node.r > 9 ? '<text x="' + (node.x + node.r + 5).toFixed(1) + '" y="' + (node.y + 3.5).toFixed(1) + '" fill="rgba(233,237,246,.66)" font-size="10.5" font-family="Inter, sans-serif">' + escape(String(node.label).slice(0, 26)) + '</text>' : '')
  ).join('')
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">' + links + circles + '</svg>'
}

/* ------------------------------------------------------------------ helpers */

export function copy (text, label) {
  const done = () => toast('ok', label ? label + ' copied' : 'Copied to clipboard')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
  } else fallbackCopy(text, done)
}

function fallbackCopy (text, done) {
  const area = document.createElement('textarea')
  area.value = text
  document.body.appendChild(area)
  area.select()
  try { document.execCommand('copy'); done() } catch (err) { toast('err', 'Copy failed') }
  area.remove()
}

export function download (url, filename) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || ''
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function debounce (fn, wait = 250) {
  let timer
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

export function savingSettings () {
  const patch = {
    mode: store.options.mode,
    max_sites: store.options.maxSites,
    per_site_timeout_ms: store.options.timeout,
    concurrency: store.options.concurrency,
    allow_synthetic: store.options.allowSynthetic,
    include_nsfw: store.options.includeNsfw,
    deep_enrich: store.options.deepEnrich,
    metadata: store.options.metadata,
    extraction: store.options.extraction,
    identity_analysis: store.options.identity,
    selected_sites: Array.from(store.selection.sites)
  }
  return api.saveSettings(patch).catch(() => null)
}
