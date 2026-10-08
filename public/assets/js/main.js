/* Head Hunter Agency — application shell */

import {
  api, store, stream, icon, toast, modal, closeModal, escape, num, copy, download,
  debounce, timeAgo, rateOf, initials, savingSettings
} from './core.js'

import {
  dashboardView, consolePanel, idlePanel, runningPanel, stagesFor, resultsView,
  findingsCards, libraryView, sourcesView, siteRows, networkView, apiView, aboutView,
  caseRowCompact, provenanceBadge
} from './views.js'

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'library', label: 'Case library' },
  { id: 'sources', label: 'Sources' },
  { id: 'network', label: 'Network' },
  { id: 'api', label: 'API & CLI' },
  { id: 'about', label: 'About' }
]

let results = { caseObject: null, detail: null, filtered: [] }
let activeTab = 'findings'

/* --------------------------------------------------------------------- boot */

async function boot () {
  renderNav()
  wireGlobal()
  go('dashboard')

  try {
    const [health, overview, presets, settings, cases, facets] = await Promise.all([
      api.health(), api.overview(), api.presets(), api.settings(), api.cases(), api.facets()
    ])
    store.health = health
    store.overview = overview
    store.presets = presets.presets || []
    store.settings = settings
    store.cases = cases.cases || []
    store.facets = facets

    store.options.mode = settings.mode || 'auto'
    store.options.maxSites = settings.max_sites || 36
    store.options.timeout = settings.per_site_timeout_ms || 6000
    store.options.concurrency = settings.concurrency || 14
    store.options.allowSynthetic = settings.allow_synthetic !== false
    store.options.includeNsfw = !!settings.include_nsfw
    store.options.deepEnrich = settings.deep_enrich !== false
    store.options.metadata = settings.metadata !== false
    store.options.extraction = settings.extraction !== false
    store.options.identity = settings.identity_analysis !== false
    if (Array.isArray(settings.selected_sites) && settings.selected_sites.length) {
      settings.selected_sites.forEach(index => store.selection.sites.add(index))
    }
    updateStatusPill()
    renderView(store.view)
    applyEgress(health.egress)
    if (!health.egress) {
      // cold probe cache: the server warms it in the background
      api.probe().then(data => {
        store.probe = data
        applyEgress(data.summary ? Object.assign({}, data.summary, { hosts: data.results }) : null)
        if (store.view === 'network') renderView('network')
      }).catch(() => null)
    }
    renderRecentCases()
  } catch (err) {
    toast('err', 'Backend unreachable', String(err.message || err))
    document.getElementById('status-pill').innerHTML = '<span class="status-dot bad"></span>offline'
  }
}

function applyEgress (egress) {
  if (!egress) return
  store.probe = { summary: egress, results: egress.hosts || (store.probe ? store.probe.results : []) }
  if (store.health) store.health.egress = egress
  updateStatusPill()
  const mini = document.getElementById('egress-mini')
  if (mini) {
    mini.innerHTML = egress.egress_open
      ? '<span style="color:var(--good)">open</span>'
      : '<span style="color:var(--maybe)">restricted</span> <span class="hint">' + egress.reachable + '/' + egress.checked + '</span>'
  }
}

function updateStatusPill () {
  const health = store.health
  const egress = (health && health.egress) || (store.probe && store.probe.summary)
  const pill = document.getElementById('status-pill')
  if (!pill) return
  const open = egress ? egress.egress_open : false
  const reachable = egress ? egress.reachable : 0
  const checked = egress ? egress.checked : 0
  pill.innerHTML = '<span class="status-dot ' + (open ? 'ok' : 'warn') + '"></span>' +
    (open ? 'live egress' : 'restricted egress') +
    '<span class="hint">· ' + reachable + '/' + checked + ' hosts</span>'
  pill.title = open
    ? 'Outbound traffic is open - cases will be collected live.'
    : 'Outbound traffic is partially filtered. Unreachable sources fall back to badged sandbox fixtures in Hybrid mode.'
}

/* ------------------------------------------------------------------- router */

function renderNav () {
  const nav = document.getElementById('nav')
  nav.innerHTML = NAV.map(item =>
    '<button class="nav-item ' + (store.view === item.id ? 'active' : '') + '" data-view="' + item.id + '">' + escape(item.label) + '</button>'
  ).join('')
}

export function go (view, params = {}) {
  store.view = view
  renderNav()
  renderView(view, params)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function renderView (view, params = {}) {
  const host = document.getElementById('view')
  if (view === 'dashboard') { host.innerHTML = dashboardView(); mountDashboard() }
  else if (view === 'library') { host.innerHTML = libraryView(); mountLibrary() }
  else if (view === 'sources') { host.innerHTML = sourcesView(); mountSources() }
  else if (view === 'network') { host.innerHTML = networkView(); mountNetwork() }
  else if (view === 'api') { host.innerHTML = apiView() }
  else if (view === 'about') { host.innerHTML = aboutView() }
  else if (view === 'results') { host.innerHTML = resultsView(store.currentCase); mountResults() }
}

/* ------------------------------------------------------------------ global */

function wireGlobal () {
  document.addEventListener('click', (event) => {
    const goto = event.target.closest('[data-goto]')
    if (goto) { go(goto.getAttribute('data-goto')); return }

    const view = event.target.closest('[data-view]')
    if (view) { go(view.getAttribute('data-view')); return }

    const preset = event.target.closest('[data-preset]')
    if (preset) { togglePreset(preset.getAttribute('data-preset')); return }

    const example = event.target.closest('[data-example]')
    if (example) {
      const input = document.getElementById('target-input')
      if (input) { input.value = example.getAttribute('data-example'); input.focus() }
      return
    }

    const copyBtn = event.target.closest('[data-copy]')
    if (copyBtn) { copy(copyBtn.getAttribute('data-copy')); return }

    const openCase = event.target.closest('[data-open-case]')
    if (openCase) { openCaseFile(openCase.getAttribute('data-open-case')); return }

    const exportBtn = event.target.closest('[data-export]')
    if (exportBtn) {
      const id = exportBtn.getAttribute('data-case')
      const format = exportBtn.getAttribute('data-export')
      download('/api/cases/' + id + '/export?format=' + format, id + '.' + (format === 'md' ? 'md' : format))
      toast('ok', 'Export started', id + ' → ' + format.toUpperCase())
      return
    }

    const deleteCase = event.target.closest('[data-delete-case]')
    if (deleteCase) { removeCase(deleteCase.getAttribute('data-delete-case')); return }

    const lookup = event.target.closest('[data-lookup]')
    if (lookup) { openLookup(lookup.getAttribute('data-lookup')); return }
  })

  document.getElementById('settings-btn').onclick = openSettings

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      const input = document.getElementById('target-input')
      if (store.view !== 'dashboard') { go('dashboard') }
      setTimeout(() => { const field = document.getElementById('target-input'); if (field) field.focus() }, 60)
      if (input && store.view === 'dashboard') input.focus()
    }
    if (event.key === 'Escape') closeModal()
  })
}

function togglePreset (id) {
  if (!id) return
  if (store.selection.presets.has(id)) store.selection.presets.delete(id)
  else store.selection.presets.add(id)
  document.querySelectorAll('[data-preset="' + id + '"]').forEach(element => element.classList.toggle('on'))
  const count = document.getElementById('selection-count')
  if (count) count.textContent = store.selection.presets.size + ' preset(s)'
  refreshPreview()
  savingSettings()
}

/* --------------------------------------------------------------- dashboard */

function mountDashboard () {
  const input = document.getElementById('target-input')
  if (input) {
    input.value = store.console.lastTarget || ''
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') launchScan() })
    input.focus()
  }
  const launch = document.getElementById('launch-btn')
  if (launch) launch.onclick = () => launchScan()
  const launch2 = document.getElementById('launch-btn-2')
  if (launch2) launch2.onclick = () => launchScan()

  document.querySelectorAll('#mode-switch button').forEach(button => {
    button.onclick = () => {
      store.options.mode = button.getAttribute('data-mode')
      document.querySelectorAll('#mode-switch button').forEach(item => item.classList.toggle('on', item === button))
      const hint = document.getElementById('mode-hint')
      if (hint) hint.textContent = modeText(store.options.mode)
      refreshPreview()
      savingSettings()
    }
  })

  const slider = (id, key, format, labelId) => {
    const element = document.getElementById(id)
    if (!element) return
    element.oninput = () => {
      store.options[key] = Number(element.value)
      const label = document.getElementById(labelId)
      if (label) label.textContent = format(store.options[key])
      refreshPreview()
    }
    element.onchange = () => savingSettings()
  }
  slider('max-sites', 'maxSites', value => value, 'max-sites-label')
  slider('timeout', 'timeout', value => value + ' ms', 'timeout-label')
  slider('concurrency', 'concurrency', value => value, 'concurrency-label')

  ;[
    ['deep-enrich', 'deepEnrich'],
    ['allow-synthetic', 'allowSynthetic'],
    ['metadata-toggle', 'metadata'],
    ['extraction-toggle', 'extraction'],
    ['identity-toggle', 'identity'],
    ['nsfw-toggle', 'includeNsfw']
  ].forEach(([id, key]) => {
    const element = document.getElementById(id)
    if (!element) return
    element.onclick = () => {
      store.options[key] = !store.options[key]
      element.classList.toggle('on', store.options[key])
      refreshPreview()
      savingSettings()
    }
  })

  refreshPreview()
}

function modeText (mode) {
  if (mode === 'live') return 'Strict live: only real HTTPS responses count; blocked sources are reported as blocked.'
  if (mode === 'sandbox') return 'Sandbox: fully offline fixtures, nothing leaves this machine.'
  return 'Hybrid: real requests first; unreachable sources are filled with clearly-labelled sandbox fixtures.'
}

const refreshPreview = debounce(async () => {
  const line = document.getElementById('preview-line')
  if (!line) return
  try {
    const preview = await api.preview(payloadFromOptions())
    line.innerHTML = '<b style="color:var(--brass-soft)">' + preview.sources + '</b> sources queued · ' +
      preview.first_party_sources + ' first-party · ~' + preview.estimated_seconds + 's estimate · ' +
      (preview.matched > preview.sources ? (preview.matched - preview.sources) + ' more available in the database' : 'full selection')
  } catch (err) {
    line.textContent = 'Selection estimation unavailable.'
  }
}, 200)

function payloadFromOptions () {
  return {
    targets: (document.getElementById('target-input') ? document.getElementById('target-input').value : store.console.lastTarget),
    presets: Array.from(store.selection.presets),
    sites: Array.from(store.selection.sites),
    mode: store.options.mode,
    max_sites: store.options.maxSites,
    per_site_timeout_ms: store.options.timeout,
    concurrency: store.options.concurrency,
    allow_synthetic: store.options.allowSynthetic,
    include_nsfw: store.options.includeNsfw,
    deep_enrich: store.options.deepEnrich,
    metadata: store.options.metadata,
    extraction: store.options.extraction,
    identity_analysis: store.options.identity
  }
}

/* ------------------------------------------------------------------- launch */

async function launchScan (prefilledTarget) {
  const input = document.getElementById('target-input')
  const candidate = typeof prefilledTarget === 'string' ? prefilledTarget : ''
  const targetValue = String(candidate || (input ? input.value : '') || store.console.lastTarget || '').trim()
  if (!targetValue) {
    toast('warn', 'No target', 'Enter a handle such as torvalds or jane_doe_1990.')
    if (input) input.focus()
    return
  }
  store.console.lastTarget = targetValue
  const payload = Object.assign(payloadFromOptions(), { targets: targetValue })
  payload.targets = targetValue

  if (store.view !== 'dashboard') go('dashboard')
  store.console.running = true
  store.console.lines = []

  const panel = document.getElementById('run-panel')
  panel.innerHTML = runningPanel(targetValue, stagesFor('queued', { total: payload.max_sites, checked: 0 }), { percent: 0, total: payload.max_sites, checked: 0 })
  const terminal = document.getElementById('terminal')
  const cancelBtn = document.getElementById('cancel-btn')

  const appendLine = (entry) => {
    store.console.lines.push(entry)
    if (store.console.lines.length > 400) store.console.lines.shift()
    const el = document.createElement('div')
    el.className = 'line lvl-' + (entry.level || 'info')
    el.innerHTML = '<span class="t">' + new Date(entry.at || Date.now()).toLocaleTimeString('en-GB', { hour12: false }) + '</span><span class="m">' + escape(entry.message) + '</span>'
    terminal.appendChild(el)
    terminal.scrollTop = terminal.scrollHeight
  }

  try {
    const started = await api.scan(payload)
    store.job = started.job
    if (cancelBtn) cancelBtn.onclick = async () => {
      cancelBtn.disabled = true
      await api.cancel(store.job).catch(() => null)
      toast('warn', 'Cancellation requested')
    }

    store.stream = stream(started.job, {
      snapshot: (payload_) => {
        (payload_.logs || []).forEach(appendLine)
        updateRunPanel(payload_.progress, payload_.status)
      },
      log: (payload_) => appendLine(payload_),
      progress: (payload_) => updateRunPanel(payload_.progress),
      meta: (payload_) => {
        appendLine({ level: 'stage', message: 'Selection resolved: ' + payload_.sites + ' sources · mode ' + payload_.mode })
      },
      done: async (payload_) => {
        const caseId = (payload_.result && payload_.result.case_id) || payload_.case_id
        appendLine({ level: 'stage', message: 'Case ' + caseId + ' sealed · compiling console view' })
        updateRunPanel(payload_.progress, 'done', true)
        if (store.stream) store.stream.close()
        store.console.running = false
        const caseObject = await api.case_(caseId)
        store.currentCase = caseObject
        results = { caseObject, detail: (caseObject.targets_detail || [])[0], filtered: [] }
        activeTab = 'findings'
        renderRecentCases()
        const summary = caseObject.summary || {}
        toast('ok', 'Investigation complete',
          summary.profiles_found + ' profile(s) · ' + summary.live_findings + ' live · exposure ' + summary.exposure_score + '/100')
        go('results')
      },
      error: (payload_) => {
        appendLine({ level: 'error', message: 'Investigation failed: ' + payload_.message })
        toast('err', 'Investigation failed', payload_.message)
        store.console.running = false
        if (store.stream) store.stream.close()
      },
      cancelled: () => {
        appendLine({ level: 'warn', message: 'Investigation cancelled by operator.' })
        toast('warn', 'Investigation cancelled')
        store.console.running = false
        if (store.stream) store.stream.close()
      }
    })
  } catch (err) {
    toast('err', 'Could not start investigation', String(err.message || err))
    store.console.running = false
  }
}

function updateRunPanel (progress, status, done) {
  if (!progress) return
  const host = document.getElementById('pipeline-host')
  if (host) host.innerHTML = stagesFor(progress.stage, progress, done)
  const fill = document.getElementById('progress-fill')
  if (fill) fill.style.width = (done ? 100 : (progress.percent || 0)) + '%'
  const text = document.getElementById('progress-text')
  if (text) text.textContent = (progress.checked || 0) + '/' + (progress.total || 0) + ' · ' + (progress.found || 0) + ' found'
}

async function renderRecentCases () {
  const host = document.getElementById('recent-cases')
  if (!host) return
  try {
    const data = await api.cases()
    store.cases = data.cases || []
    if (!store.cases.length) {
      host.innerHTML = '<div class="hint" style="padding:22px">No cases yet. Your first investigation will appear here.</div>'
      return
    }
    host.innerHTML = '<table class="data"><thead><tr><th>Case</th><th>Findings</th><th>Live</th><th>Score</th><th>When</th><th></th></tr></thead><tbody>' +
      store.cases.slice(0, 6).map(caseRowCompact).join('') + '</tbody></table>'
  } catch (err) {}
}

/* ------------------------------------------------------------------ results */

function mountResults () {
  const caseObject = store.currentCase
  if (!caseObject) { go('dashboard'); return }
  const targets = caseObject.targets || []
  const activeTarget = store.resultsTarget && targets.includes(store.resultsTarget) ? store.resultsTarget : targets[0]
  store.resultsTarget = activeTarget
  results.detail = (caseObject.targets_detail || []).find(item => item.target === activeTarget) || (caseObject.targets_detail || [])[0]
  results.filtered = (results.detail && results.detail.profiles) || []

  document.querySelectorAll('[data-target-tab]').forEach(button => {
    button.onclick = () => {
      store.resultsTarget = button.getAttribute('data-target-tab')
      go('results')
    }
  })

  document.querySelectorAll('#result-tabs .tab').forEach(tab => {
    tab.onclick = () => {
      activeTab = tab.getAttribute('data-tab')
      document.querySelectorAll('#result-tabs .tab').forEach(item => item.classList.toggle('on', item === tab))
      document.querySelectorAll('.tabpane').forEach(pane => pane.classList.toggle('on', pane.getAttribute('data-pane') === activeTab))
    }
  })

  const search = document.getElementById('findings-search')
  if (search) search.oninput = applyFindingFilters
  document.querySelectorAll('#status-filter button').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('#status-filter button').forEach(item => item.classList.toggle('on', item === button))
      applyFindingFilters()
    }
  })
  document.querySelectorAll('#provenance-filter button').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('#provenance-filter button').forEach(item => item.classList.toggle('on', item === button))
      applyFindingFilters()
    }
  })
  const sort = document.getElementById('sort-select')
  if (sort) sort.onchange = applyFindingFilters

  const copyLinks = document.getElementById('copy-links')
  if (copyLinks) copyLinks.onclick = () => copy(results.filtered.map(profile => profile.link).join('\n'), results.filtered.length + ' links')
}

function applyFindingFilters () {
  const term = (document.getElementById('findings-search') || {}).value || ''
  const status = (document.querySelector('#status-filter button.on') || {}).dataset ? document.querySelector('#status-filter button.on').dataset.status : 'all'
  const prov = document.querySelector('#provenance-filter button.on') ? document.querySelector('#provenance-filter button.on').getAttribute('data-prov') : 'all'
  const sort = (document.getElementById('sort-select') || {}).value || 'rate'

  let list = ((results.detail && results.detail.profiles) || []).slice()
  if (term) {
    const needle = term.toLowerCase()
    list = list.filter(profile => (profile.site + ' ' + profile.type + ' ' + profile.country + ' ' + (profile.title || '') + ' ' + (profile.text || ''))
      .toLowerCase().includes(needle))
  }
  if (status !== 'all') list = list.filter(profile => profile.status === status)
  if (prov !== 'all') list = list.filter(profile => (profile.provenance || 'synthetic') === prov)

  if (sort === 'rate') list.sort((a, b) => rateOf(b) - rateOf(a))
  else if (sort === 'rank') list.sort((a, b) => (Number(a.rank) || 99999) - (Number(b.rank) || 99999))
  else if (sort === 'name') list.sort((a, b) => String(a.site).localeCompare(String(b.site)))
  else if (sort === 'category') list.sort((a, b) => String(a.type).localeCompare(String(b.type)))

  results.filtered = list
  const host = document.getElementById('findings-grid')
  if (host) host.innerHTML = findingsCards(list)
}

/* ------------------------------------------------------------------ library */

function mountLibrary () {
  const refresh = document.getElementById('refresh-cases')
  if (refresh) refresh.onclick = async () => {
    const data = await api.cases()
    store.cases = data.cases || []
    renderView('library')
    toast('ok', 'Case library refreshed')
  }
  const clear = document.getElementById('clear-cases')
  if (clear) clear.onclick = async () => {
    if (!confirm('Delete every stored case file? This cannot be undone.')) return
    await api.del('/api/cases')
    store.cases = []
    renderView('library')
    toast('warn', 'All cases deleted')
  }
}

async function openCaseFile (id) {
  try {
    const caseObject = await api.case_(id)
    store.currentCase = caseObject
    store.resultsTarget = (caseObject.targets || [])[0]
    activeTab = 'findings'
    go('results')
  } catch (err) {
    toast('err', 'Could not open case', String(err.message || err))
  }
}

async function removeCase (id) {
  if (!confirm('Delete case ' + id + '?')) return
  await api.deleteCase(id).catch(() => null)
  const data = await api.cases().catch(() => ({ cases: [] }))
  store.cases = data.cases || []
  if (store.view === 'library') renderView('library')
  toast('warn', 'Case deleted', id)
}

/* ------------------------------------------------------------------ sources */

function mountSources () {
  const search = document.getElementById('sites-search')
  const category = document.getElementById('sites-category')
  const country = document.getElementById('sites-country')
  const nsfw = document.getElementById('sites-nsfw')
  const sort = document.getElementById('sites-sort')

  const reload = debounce(async () => {
    const query = new URLSearchParams({
      search: search ? search.value : '',
      category: category ? category.value : '',
      country: country ? country.value : '',
      nsfw: nsfw ? nsfw.value : 'exclude',
      sort: sort ? sort.value : 'rank',
      limit: '400'
    })
    try {
      const data = await api.sites('?' + query.toString())
      store.sites = data.sites || []
      const body = document.getElementById('sites-body')
      if (body) body.innerHTML = siteRows(store.sites)
      const count = document.getElementById('sites-count')
      if (count) count.textContent = store.sites.length + ' shown'
      bindCheckboxes()
    } catch (err) {}
  }, 250)

  ;[search, category, country, nsfw, sort].forEach(element => {
    if (!element) return
    element.addEventListener('input', reload)
    element.addEventListener('change', reload)
  })

  const selectTop = document.getElementById('sites-select-top')
  if (selectTop) selectTop.onclick = () => {
    store.sites.forEach(site => store.selection.sites.add(site.index))
    bindCheckboxes(true)
    savingSettings()
    toast('ok', store.sites.length + ' sources selected')
  }
  const clear = document.getElementById('sites-clear')
  if (clear) clear.onclick = () => {
    store.selection.sites.clear()
    store.selection.presets.clear()
    bindCheckboxes(true)
    savingSettings()
    toast('warn', 'Selection cleared')
  }
  const run = document.getElementById('sites-run')
  if (run) run.onclick = () => {
    if (!store.selection.sites.size && !store.selection.presets.size) {
      toast('warn', 'Nothing selected', 'Tick sources or pick a preset first.')
      return
    }
    go('dashboard')
    setTimeout(() => launchScan(), 120)
  }
  bindCheckboxes()
}

function bindCheckboxes (force) {
  document.querySelectorAll('.site-check').forEach(checkbox => {
    const index = Number(checkbox.getAttribute('data-index'))
    if (force) checkbox.checked = store.selection.sites.has(index)
    checkbox.onchange = () => {
      if (checkbox.checked) store.selection.sites.add(index)
      else store.selection.sites.delete(index)
      savingSettings()
    }
  })
}

/* ------------------------------------------------------------------ network */

function mountNetwork () {
  const reprobe = document.getElementById('reprobe')
  if (reprobe) reprobe.onclick = async () => {
    reprobe.disabled = true
    reprobe.textContent = 'Probing…'
    try {
      const data = await api.probe(true)
      store.probe = data
      renderView('network')
      toast('ok', 'Probes refreshed', data.summary.reachable + '/' + data.summary.checked + ' reachable')
    } catch (err) {
      toast('err', 'Probe failed', String(err.message || err))
      reprobe.disabled = false
    }
  }
  const settings = document.getElementById('open-settings')
  if (settings) settings.onclick = openSettings
}

/* ----------------------------------------------------------------- settings */

async function openSettings () {
  let current = store.settings || {}
  try { current = await api.settings() } catch (err) {}
  const body = `
    <div class="grid cols-2">
      <div class="field"><span class="label">Operator name</span>
        <input class="input" id="set-operator" value="${escape(current.operator || 'analyst')}"></div>
      <div class="field"><span class="label">GitHub token (optional)</span>
        <input class="input" id="set-token" placeholder="${current.has_github_token ? 'stored' : 'ghp_… raises API rate limits'}" value=""></div>
    </div>
    <div class="field"><span class="label">Outbound proxy (http/https/socks)</span>
      <input class="input" id="set-proxy" placeholder="http://user:pass@host:port" value="${escape(current.proxy || '')}">
      <div class="hint" style="margin-top:8px">Routing through a proxy is often what turns a restricted deployment into a fully live one.
      Leave empty for direct connections.</div></div>
    <div class="field"><span class="label">User agent</span>
      <input class="input" id="set-ua" value="${escape(current.user_agent || '')}"></div>
    <div class="grid cols-3">
      <div class="field"><span class="label">Google API key</span>
        <input class="input" id="set-gkey" placeholder="optional" value=""></div>
      <div class="field"><span class="label">Google CSE id</span>
        <input class="input" id="set-gcs" placeholder="optional" value=""></div>
      <div class="field"><span class="label">Default mode</span>
        <select class="select" id="set-mode">
          <option value="auto" ${current.mode === 'auto' ? 'selected' : ''}>Hybrid</option>
          <option value="live" ${current.mode === 'live' ? 'selected' : ''}>Strict live</option>
          <option value="sandbox" ${current.mode === 'sandbox' ? 'selected' : ''}>Sandbox</option>
        </select></div>
    </div>
    <div class="hint">Secrets stay server-side in <code class="mono">runtime/settings.json</code> and are never returned to the browser.</div>`

  modal('Settings', body, `
    <button class="btn ghost" data-close>Cancel</button>
    <button class="btn primary" id="save-settings">${icon('check')} Save settings</button>`, {
    onMount: (root) => {
      root.querySelector('#save-settings').onclick = async () => {
        const patch = {
          operator: root.querySelector('#set-operator').value,
          proxy: root.querySelector('#set-proxy').value,
          user_agent: root.querySelector('#set-ua').value,
          mode: root.querySelector('#set-mode').value
        }
        const token = root.querySelector('#set-token').value
        if (token) patch.github_token = token
        const gkey = root.querySelector('#set-gkey').value
        if (gkey) patch.google_key = gkey
        const gcs = root.querySelector('#set-gcs').value
        if (gcs) patch.google_cs = gcs
        store.settings = await api.saveSettings(patch)
        store.options.mode = patch.mode
        closeModal()
        toast('ok', 'Settings saved', patch.proxy ? 'Proxy configured — re-run a case for live coverage.' : 'Preferences stored server-side.')
        if (store.view === 'dashboard') renderView('dashboard')
      }
    }
  })
}

/* ------------------------------------------------------------------- lookup */

async function openLookup (connectorId) {
  const input = document.getElementById('target-input')
  const handle = (input && input.value.trim()) || store.console.lastTarget
  if (!handle) {
    toast('warn', 'No handle', 'Type a handle in the dashboard search field first.')
    return
  }
  modal('First-party lookup', '<div class="hint">Querying official endpoints for <b>' + escape(handle) + '</b>…</div>', '')
  try {
    const data = await api.lookup(handle)
    const github = data.github || {}
    const pypi = data.pypi || {}
    const npm = data.npm || {}
    const body = `
      <div class="label">Connector results</div>
      ${connectorRow('GitHub', github, github.found ? [
        ['Name', github.name || github.username],
        ['Followers', num(github.followers)],
        ['Public repos', num(github.public_repos)],
        ['Location', github.location || '—'],
        ['Joined', github.created_at ? new Date(github.created_at).toLocaleDateString() : '—']
      ] : null)}
      ${connectorRow('PyPI', pypi, pypi.found ? [
        ['Packages', num(pypi.package_count)],
        ['Profile', pypi.url]
      ] : null)}
      ${connectorRow('npm', npm, npm.found ? [
        ['Packages', num(npm.package_count)],
        ['Owned', num(npm.owned_count)]
      ] : null)}
      ${(data.social_accounts || []).length ? '<div class="label" style="margin-top:16px">Declared accounts</div><div class="tag-list">' +
        data.social_accounts.map(account => '<span class="tag">' + escape(account.provider) + ' <b>' + escape(account.handle) + '</b></span>').join('') + '</div>' : ''}
      ${(data.repos || []).length ? '<div class="label" style="margin-top:16px">Recent repositories</div>' +
        data.repos.slice(0, 6).map(repo => '<div class="doc-row"><div><div class="doc-path">' + escape(repo.name) + '</div>' +
          '<div class="doc-desc">' + escape(repo.language || '') + ' · ★ ' + num(repo.stars) + '</div></div></div>').join('') : ''}`
    modal('First-party lookup — ' + handle, body, '<button class="btn ghost" data-close>Close</button>')
  } catch (err) {
    modal('First-party lookup', '<div class="notice warn">' + icon('warn') + '<div>Lookup failed: ' + escape(String(err.message || err)) + '</div></div>', '<button class="btn ghost" data-close>Close</button>')
  }
}

function connectorRow (label, result, rows) {
  const found = result && result.found
  return `<div class="doc-row">
    <span class="doc-method">${escape(label)}</span>
    <div style="flex:1">
      <div class="doc-path">${found ? '<span class="badge good">found</span>' : '<span class="badge neutral">no match</span>'}
        <span class="hint" style="margin-left:8px">${escape(result && result.error ? result.error : (result && result.latency_ms ? result.latency_ms + ' ms' : ''))}</span></div>
      ${rows ? '<dl class="kv" style="margin-top:8px">' + rows.map(([key, value]) => '<dt>' + escape(key) + '</dt><dd>' + escape(value) + '</dd>').join('') + '</dl>' : ''}
    </div>
  </div>`
}

/* ---------------------------------------------------------------------- go */

boot()
