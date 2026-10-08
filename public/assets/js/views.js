/* Head Hunter Agency — view templates */

import {
  escape, num, compact, timeAgo, ring, sparkline, barList, forceGraph, icon,
  statusClass, rateOf, rateColor, initials, duration, clock, store
} from './core.js'

/* ------------------------------------------------------------------ shared */

export function provenanceBadge (provenance) {
  if (provenance === 'live') return '<span class="badge live">' + icon('bolt') + 'live</span>'
  if (provenance === 'synthetic') return '<span class="badge sim">' + icon('flask') + 'sandbox</span>'
  if (provenance === 'challenge') return '<span class="badge neutral">challenge</span>'
  return '<span class="badge neutral">' + escape(provenance || 'unknown') + '</span>'
}

function statusBadge (status) {
  if (!status) return '<span class="badge neutral">unknown</span>'
  const label = status === 'good' ? 'detected' : status === 'maybe' ? 'possible' : status === 'bad' ? 'weak' : escape(status)
  return '<span class="badge ' + statusClass(status) + '">' + label + '</span>'
}

function avatarFor (profile) {
  const image = profile.avatar || profile.image || profile.og_image || (profile.live && profile.live.avatar_url)
  if (image && /^https?:/.test(image)) {
    return '<div class="avatar"><img src="' + escape(image) + '" alt="" loading="lazy" onerror="this.parentNode.textContent=\'' + escape(initials(profile.site)) + '\'"></div>'
  }
  return '<div class="avatar">' + escape(initials(profile.site || profile.username)) + '</div>'
}

/* --------------------------------------------------------------- dashboard */

export function dashboardView () {
  const overview = store.overview
  const database = (overview && overview.database) || { sites: 999, detections: 1821, categories: 91, countries: 44, ranked: 931, nsfw: 40 }
  const cases = (overview && overview.cases) || store.health && store.health.cases || { cases: 0, unique_targets: 0, profiles_catalogued: 0, live_findings: 0 }
  const connectors = (overview && overview.connectors) || []

  return `
  <section class="hero">
    <div class="hero-inner">
      <span class="eyebrow">${icon('shield')} public-records osint · ${num(database.sites)} platforms indexed</span>
      <h1>Locate a digital footprint across <em>${num(database.sites)}</em> social platforms</h1>
      <p class="lede">Head Hunter Agency is the analyst console for the open-source social-analyzer engine:
      ${num(database.detections)} detection techniques, ${num(database.categories)} categories and first-party verification through GitHub, PyPI and npm.
      Enter a handle to open a case.</p>
      <div class="search-shell">
        <div class="search-field">
          ${icon('search')}
          <input class="input" id="target-input" placeholder="Handle to investigate — e.g. torvalds, jane_doe (comma-separated for groups)" autocomplete="off" spellcheck="false">
          <span class="kbd">⌘K</span>
        </div>
        <button class="btn primary" id="launch-btn">${icon('target')} Launch investigation</button>
      </div>
      <div class="quick-chips">
        ${(store.presets || []).slice(0, 6).map(preset => `
          <span class="chip ${store.selection.presets.has(preset.id) ? 'on' : ''}" data-preset="${escape(preset.id)}">
            ${escape(preset.label)} <span class="count">${preset.count}</span>
          </span>`).join('')}
        <span class="example-link">Examples:
          <b data-example="torvalds">torvalds</b> ·
          <b data-example="isaacs">isaacs</b> ·
          <b data-example="octocat">octocat</b> ·
          <b data-example="jane_doe_1990">jane_doe_1990</b>
        </span>
      </div>
    </div>
  </section>

  <div class="console-grid">
    <div class="card pad" id="console-panel">${consolePanel()}</div>
    <div id="run-panel">${idlePanel()}</div>
  </div>

  <div class="section-title"><h2>Agency capability</h2><div class="line"></div>
    <div class="right"><button class="btn ghost small" data-goto="network">${icon('activity')} Network status</button>
    <button class="btn ghost small" data-goto="sources">${icon('grid')} Source database</button></div>
  </div>

  <div class="grid cols-4">
    <div class="card kpi"><div class="k-label">Platforms indexed</div><div class="k-value">${num(database.sites)}</div>
      <div class="k-sub">${num(database.ranked)} ranked · ${num(database.nsfw)} adult</div></div>
    <div class="card kpi"><div class="k-label">Detection techniques</div><div class="k-value">${num(database.detections)}</div>
      <div class="k-sub">${escape((overview && overview.engine && overview.engine.detection_level) || 'high')} sensitivity profile</div></div>
    <div class="card kpi"><div class="k-label">Coverage surface</div><div class="k-value">${num(database.categories)}<span style="font-size:16px;color:var(--text-mute)"> / ${num(database.countries)}</span></div>
      <div class="k-sub">categories / countries</div></div>
    <div class="card kpi"><div class="k-label">Cases on file</div><div class="k-value">${num(cases.cases || 0)}</div>
      <div class="k-sub">${num(cases.profiles_catalogued || 0)} profiles catalogued</div></div>
  </div>

  <div class="two-col" style="margin-top:20px">
    <div class="card">
      <div class="card-head"><h3>Recent investigations</h3><div class="spacer"></div>
        <button class="btn ghost small" data-goto="library">Open case library</button></div>
      <div id="recent-cases" class="table-wrap"></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Verified connectors</h3><div class="spacer"></div>
        <span class="hint">first-party APIs</span></div>
      <div class="pad">
        ${connectors.map(connector => `
          <div class="switch-row">
            <div>
              <div class="sr-label" style="display:flex;align-items:center;gap:8px">
                <span style="width:9px;height:9px;border-radius:50%;background:${escape(connector.accent)};display:inline-block"></span>
                ${escape(connector.label)}
              </div>
              <div class="sr-desc">${escape(connector.host)} · ${escape((connector.capabilities || []).join(', '))}</div>
            </div>
            <button class="btn ghost small" data-lookup="${escape(connector.id)}">Test</button>
          </div>`).join('') || '<div class="hint">Connectors unavailable.</div>'}
        <div class="hint" style="margin-top:14px">Activity (last 14 days)</div>
        <div id="activity-spark">${sparkline(((overview && overview.stats && overview.stats.activity) || []).map(day => ({ value: day.cases })), { dots: true })}</div>
      </div>
    </div>
  </div>`
}

export function consolePanel () {
  const options = store.options
  const presets = store.presets || []
  return `
    <div class="panel-head">
      <h3>Investigation parameters</h3>
      <div class="right"><span class="hint" id="selection-count">${store.selection.presets.size} preset(s)</span></div>
    </div>

    <div class="field">
      <span class="label">Collection mode</span>
      <div class="mode-switch" id="mode-switch">
        <button data-mode="auto" class="${options.mode === 'auto' ? 'on' : ''}" title="Real requests first, sandbox fixtures for blocked sources">Hybrid</button>
        <button data-mode="live" class="${options.mode === 'live' ? 'on' : ''}" title="Real requests only - nothing is simulated">Strict live</button>
        <button data-mode="sandbox" class="${options.mode === 'sandbox' ? 'on' : ''}" title="Offline demo data only, no outbound requests">Sandbox</button>
      </div>
      <div class="hint" style="margin-top:8px" id="mode-hint">${modeHint(options.mode)}</div>
    </div>

    <div class="field">
      <span class="label">Source presets</span>
      <div class="preset-grid">
        ${presets.map(preset => `
          <button class="preset ${store.selection.presets.has(preset.id) ? 'on' : ''}" data-preset="${escape(preset.id)}">
            <div class="p-label">${escape(preset.label)}</div>
            <div class="p-count">${preset.count} sources</div>
          </button>`).join('') || '<div class="hint">Loading presets…</div>'}
      </div>
      <div class="hint" style="margin-top:10px">Fine-tune in the <b style="color:var(--brass-soft);cursor:pointer" data-goto="sources">source database</b>.</div>
    </div>

    <div class="field">
      <span class="label">Sources per run · <span id="max-sites-label">${options.maxSites}</span></span>
      <input class="range" type="range" id="max-sites" min="5" max="150" step="1" value="${options.maxSites}">
    </div>

    <div class="field">
      <span class="label">Provider timeout · <span id="timeout-label">${options.timeout} ms</span></span>
      <input class="range" type="range" id="timeout" min="2000" max="15000" step="500" value="${options.timeout}">
    </div>

    <div class="field">
      <span class="label">Parallel workers · <span id="concurrency-label">${options.concurrency}</span></span>
      <input class="range" type="range" id="concurrency" min="2" max="30" step="1" value="${options.concurrency}">
    </div>

    <div class="field" style="margin-bottom:6px">
      <span class="label">Modules</span>
      ${switchRow('deep-enrich', 'First-party verification', 'Confirm findings through official GitHub / PyPI / npm APIs', options.deepEnrich)}
      ${switchRow('allow-synthetic', 'Sandbox fallback', 'Generate clearly-labelled fixtures when a source is unreachable', options.allowSynthetic)}
      ${switchRow('metadata-toggle', 'Metadata extraction', 'Title, OpenGraph, description and generator patterns', options.metadata)}
      ${switchRow('extraction-toggle', 'Pattern extraction', 'Emails, URLs, handles and phone patterns from the page', options.extraction)}
      ${switchRow('identity-toggle', 'Identity intelligence', 'Name origins, token analysis and possible age', options.identity)}
      ${switchRow('nsfw-toggle', 'Include adult sources', 'Adds 18+ platforms to the sweep', options.includeNsfw)}
    </div>

    <div id="preview-line" class="hint" style="margin:14px 0 12px">—</div>
    <button class="btn primary" id="launch-btn-2" style="width:100%">${icon('target')} Launch investigation</button>`
}

function modeHint (mode) {
  if (mode === 'live') return 'Strict live: only real HTTPS responses count. Blocked sources are reported as blocked.'
  if (mode === 'sandbox') return 'Sandbox: fully offline fixtures. Nothing leaves this machine - useful for demos and UI evaluation.'
  return 'Hybrid: real requests first; sources that cannot be reached are filled with clearly-labelled sandbox fixtures.'
}

function switchRow (id, label, description, on) {
  return `<div class="switch-row"><div><div class="sr-label">${escape(label)}</div>
    <div class="sr-desc">${escape(description)}</div></div>
    <div class="switch ${on ? 'on' : ''}" id="${id}" role="switch" tabindex="0"></div></div>`
}

export function idlePanel () {
  const overview = store.overview
  const topSources = (overview && overview.top_sources) || []
  return `
  <div class="card pad" style="min-height:180px">
    <div class="panel-head"><h3>Investigation console</h3><div class="right">
      <span class="status-pill"><span class="status-dot ok"></span>engine ready</span></div></div>
    <p class="hint">Set a target and launch an investigation. Every run streams live: source checks, live/blocked decisions,
    first-party verification and the compiled case file.</p>
    <div class="grid cols-4" style="margin-top:18px">
      <div><div class="k-label" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-mute)">Engine</div>
        <div style="margin-top:6px">${escape((overview && overview.engine && overview.engine.name) || 'social-analyzer')} ${escape((overview && overview.engine && overview.engine.version) || '')}</div></div>
      <div><div class="k-label" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-mute)">Sensitivity</div>
        <div style="margin-top:6px">${escape((overview && overview.engine && overview.engine.detection_level) || 'high')}</div></div>
      <div><div class="k-label" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-mute)">Workers</div>
        <div style="margin-top:6px">${(overview && overview.engine && overview.engine.default_workers) || store.options.concurrency} parallel</div></div>
      <div><div class="k-label" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-mute)">Egress</div>
        <div style="margin-top:6px" id="egress-mini">checking…</div></div>
    </div>
  </div>
  <div class="card pad" style="margin-top:18px">
    <div class="panel-head"><h3>Highest-traffic sources</h3><div class="right"><span class="hint">by Alexa global rank</span></div></div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>#</th><th>Platform</th><th>Category</th><th>Country</th></tr></thead>
        <tbody>${topSources.map((site, index) => `<tr>
          <td class="mono">${index + 1}</td>
          <td><strong>${escape(site.host)}</strong></td>
          <td>${escape(String(site.category).split(' > ')[0])}</td>
          <td>${escape(site.country)}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">Loading source database…</td></tr>'}</tbody>
      </table>
    </div>
  </div>`
}

export function pipeline (stages) {
  return '<div class="pipeline">' + stages.map(stage => `
    <div class="stage ${stage.state}"><span class="dot"></span><span>${escape(stage.label)}</span>
      <span class="meta">${escape(stage.meta || '')}</span></div>`).join('') + '</div>'
}

export function runningPanel (target, stages, progress) {
  return `
  <div class="card pad">
    <div class="panel-head">
      <h3>Investigation in progress</h3>
      <div class="right">
        <span class="status-pill"><span class="status-dot warn"></span><span id="run-target">${escape(target)}</span></span>
        <button class="btn ghost small" id="cancel-btn">${icon('stop')} Cancel</button>
      </div>
    </div>
    <div id="pipeline-host">${pipeline(stages)}</div>
    <div style="margin:16px 0 8px;display:flex;align-items:center;gap:12px">
      <div class="progress-track" style="flex:1"><div class="progress-fill" id="progress-fill" style="width:${progress.percent || 0}%"></div></div>
      <span class="mono" id="progress-text">${progress.checked || 0}/${progress.total || 0}</span>
    </div>
    <div class="terminal" id="terminal"></div>
    <div class="hint" style="margin-top:10px">Live decisions stream from the scanner: <span style="color:#a9c2ff">live</span>,
      <span style="color:#cbb0ff">sandbox</span>, <span style="color:#ffd98b">blocked</span>.</div>
  </div>`
}

export const STAGE_DEFS = [
  { key: 'queued', label: 'Queue investigation' },
  { key: 'sweep', label: 'Sweep selected sources' },
  { key: 'verify', label: 'Verify first-party anchors' },
  { key: 'identity', label: 'Identity intelligence' },
  { key: 'compiling', label: 'Compile case file' },
  { key: 'sealed', label: 'Seal & store case' }
]

export function stagesFor (stageKey, progress, done) {
  const order = STAGE_DEFS.map(definition => definition.key)
  const current = done ? order.length : Math.max(0, order.indexOf(stageKey))
  return STAGE_DEFS.map((definition, index) => ({
    label: definition.label,
    state: index < current || done ? 'done' : index === current ? 'run' : '',
    meta: index === 1 && progress ? (progress.checked || 0) + '/' + (progress.total || 0) + ' checked · ' + (progress.found || 0) + ' found' : ''
  }))
}

/* ----------------------------------------------------------------- results */

export function resultsView (caseObject) {
  if (!caseObject) return '<div class="empty">No case loaded.</div>'
  const summary = caseObject.summary || {}
  const targets = caseObject.targets || []
  const activeTarget = store.resultsTarget && targets.includes(store.resultsTarget) ? store.resultsTarget : targets[0]
  const detail = (caseObject.targets_detail || []).find(item => item.target === activeTarget) || (caseObject.targets_detail || [])[0] || { profiles: [], cleared: [], unreachable: [], stats: { by_category: [], by_country: [], status_counts: {}, rating_histogram: {} }, exposure: {}, coverage: {}, identity: {} }
  const profiles = detail.profiles || []
  const simulated = summary.simulated_findings || 0
  const live = summary.live_findings || 0

  return `
  <div class="results-head">
    <div class="target-block">
      <div class="label" style="margin-bottom:8px">Case ${escape(caseObject.id)} · ${escape(new Date(caseObject.created_at).toLocaleString())}</div>
      <div class="target-title">${escape(activeTarget || '—')}</div>
      <div class="target-meta">
        ${provenanceBadge(caseObject.provenance)}
        <span class="badge neutral">${icon('layers')}${escape(summary.sites_checked || 0)} sources</span>
        <span class="badge neutral">${icon('clock')}${escape(duration(caseObject.duration_ms))}</span>
        <span class="badge neutral">${escape(caseObject.mode || 'auto')} mode</span>
        ${targets.length > 1 ? '<span class="badge neutral">' + targets.length + ' targets</span>' : ''}
      </div>
      ${targets.length > 1 ? `<div class="tag-list" style="margin-top:14px">${targets.map(target => `<button class="chip ${target === activeTarget ? 'on' : ''}" data-target-tab="${escape(target)}">${escape(target)}</button>`).join('')}</div>` : ''}
    </div>
    <div style="margin-left:auto;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      ${ring(summary.exposure_score || 0)}
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="badge neutral" style="align-self:flex-start">${escape(summary.label || '')}</span>
        <div class="hint" style="max-width:260px">${escape(summary.advice || '')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary small" data-goto="dashboard">${icon('target')} New investigation</button>
        <button class="btn ghost small" data-goto="library">${icon('folder')} Case library</button>
        <button class="btn ghost small" data-export="json" data-case="${escape(caseObject.id)}">${icon('download')} JSON</button>
        <button class="btn ghost small" data-export="csv" data-case="${escape(caseObject.id)}">${icon('download')} CSV</button>
        <button class="btn ghost small" data-export="md" data-case="${escape(caseObject.id)}">${icon('file')} Report</button>
      </div>
    </div>
  </div>

  <div class="grid cols-5" style="margin-top:24px">
    <div class="card kpi"><div class="k-label">Profiles found</div><div class="k-value">${num(summary.profiles_found || 0)}</div>
      <div class="k-sub">${num(summary.high_confidence || 0)} full-confidence</div></div>
    <div class="card kpi"><div class="k-label">Live findings</div><div class="k-value" style="color:var(--live)">${num(live)}</div>
      <div class="k-sub">verified this run</div></div>
    <div class="card kpi"><div class="k-label">Sandbox findings</div><div class="k-value" style="color:#cbb0ff">${num(simulated)}</div>
      <div class="k-sub">offline fixtures</div></div>
    <div class="card kpi"><div class="k-label">Coverage</div><div class="k-value">${num(summary.coverage_percent || 0)}<span style="font-size:16px;color:var(--text-mute)">%</span></div>
      <div class="k-sub">sources that answered</div></div>
    <div class="card kpi"><div class="k-label">Average rating</div><div class="k-value">${num((detail.stats && detail.stats.avg_rate) || 0)}<span style="font-size:16px;color:var(--text-mute)">%</span></div>
      <div class="k-sub">detection confidence</div></div>
  </div>

  ${simulated > 0 ? `<div class="notice" style="margin-top:18px">${icon('flask')}<div>
    <b>Sandbox data present.</b> ${num(live)} finding(s) came from real HTTPS responses; ${num(simulated)} are deterministic offline fixtures
    because those sources could not be reached from this deployment (egress filtering, proxy or rate limits).
    Sandbox records are badged <span class="badge sim">sandbox</span> everywhere and tagged <code>provenance:"synthetic"</code> in exports.
    Configure a proxy in Settings or run on a host with open egress for a fully live case.
    <button class="btn ghost small" style="margin-top:10px" data-goto="network">View network status</button></div></div>`
    : `<div class="notice live" style="margin-top:18px">${icon('bolt')}<div><b>Fully live case.</b> Every finding came from a real response captured during this run.</div></div>`}

  <div class="tabs" style="margin-top:24px" id="result-tabs">
    <button class="tab on" data-tab="findings">Findings <span class="hint">${profiles.length}</span></button>
    <button class="tab" data-tab="intelligence">Intelligence</button>
    <button class="tab" data-tab="distribution">Distribution</button>
    <button class="tab" data-tab="graph">Link graph</button>
    <button class="tab" data-tab="cleared">Cleared & blocked</button>
    <button class="tab" data-tab="notes">Report notes</button>
    <button class="tab" data-tab="raw">Raw JSON</button>
  </div>

  <div class="tabpane on" data-pane="findings">
    <div class="toolbar" style="margin-bottom:16px">
      <div class="search-field" style="flex:0 0 260px;max-width:260px">${icon('search')}
        <input class="input" id="findings-search" placeholder="Filter findings…" style="padding-left:44px"></div>
      <div class="seg" id="status-filter">
        <button class="on" data-status="all">All</button>
        <button data-status="good">Detected</button>
        <button data-status="maybe">Possible</button>
        <button data-status="bad">Weak</button>
      </div>
      <div class="seg" id="provenance-filter">
        <button class="on" data-prov="all">Any source</button>
        <button data-prov="live">Live</button>
        <button data-prov="synthetic">Sandbox</button>
      </div>
      <select class="select" id="sort-select" style="min-width:170px">
        <option value="rate">Sort: confidence</option>
        <option value="rank">Sort: platform rank</option>
        <option value="name">Sort: platform name</option>
        <option value="category">Sort: category</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn ghost small" id="copy-links">${icon('link')} Copy links</button>
      </div>
    </div>
    <div class="findings" id="findings-grid">${findingsCards(profiles)}</div>
  </div>

  <div class="tabpane" data-pane="intelligence">${intelligencePane(detail, caseObject)}</div>
  <div class="tabpane" data-pane="distribution">${distributionPane(detail, caseObject)}</div>
  <div class="tabpane" data-pane="graph">${graphPane(detail)}</div>
  <div class="tabpane" data-pane="cleared">${clearedPane(detail)}</div>
  <div class="tabpane" data-pane="notes">${notesPane(caseObject, detail)}</div>
  <div class="tabpane" data-pane="raw"><pre class="json">${escape(JSON.stringify(caseObject, null, 2))}</pre></div>`
}

export function findingsCards (profiles) {
  if (!profiles || !profiles.length) {
    return '<div class="empty">' + icon('search') + '<div>No findings matched. Try widening the source selection or switching to Hybrid mode.</div></div>'
  }
  return profiles.map((profile, index) => {
    const rate = rateOf(profile)
    const signals = (profile.signals || []).slice(0, 5)
    const description = profile.description || profile.text || profile.bio || ''
    return `
    <article class="card finding" data-finding="${index}" data-prov="${escape(profile.provenance || 'synthetic')}" data-status="${escape(profile.status || '')}"
      data-rate="${rate}" data-rank="${escape(profile.rank || 0)}" data-site="${escape(profile.site || '')}" data-category="${escape(profile.type || '')}">
      <div class="finding-top">
        ${avatarFor(profile)}
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="site">${escape(profile.site)}</span>
            ${statusBadge(profile.status)}
            ${provenanceBadge(profile.provenance)}
          </div>
          <div class="url" title="${escape(profile.link)}">${escape(String(profile.link || '').replace(/^https?:\/\//, ''))}</div>
        </div>
      </div>
      ${description ? '<div class="desc">' + escape(String(description).slice(0, 260)) + '</div>' : ''}
      <div class="meta-row">
        <span class="tag"><b>cat</b> ${escape(String(profile.type || '—').split(' > ')[0])}</span>
        <span class="tag"><b>geo</b> ${escape(profile.country || '—')}</span>
        <span class="tag"><b>rank</b> ${escape(profile.rank || '—')}</span>
        ${profile.last_activity_days ? '<span class="tag"><b>last seen</b> ~' + escape(profile.last_activity_days) + 'd</span>' : ''}
      </div>
      ${signals.length ? '<div class="signals">' + signals.map(signal => '<span class="signal">' + escape(signal.label || signal.name) + '</span>').join('') + '</div>' : ''}
      <div class="foot">
        <span class="rate-num" style="color:' + rateColor(rate) + '">' + escape(profile.rate || '%0') + '</span>
        <div class="rate-bar"><i style="width:' + Math.min(100, rate) + '%;background:' + rateColor(rate) + '"></i></div>
        <a class="btn ghost small" href="${escape(profile.link)}" target="_blank" rel="noopener">${icon('external')}</a>
        <button class="btn ghost small" data-copy="${escape(profile.link)}">${icon('copy')}</button>
      </div>
    </article>`
  }).join('')
}

function intelligencePane (detail, caseObject) {
  const identity = detail.identity || {}
  const live = detail.live_identity || {}
  const github = live.github || {}
  const pypi = live.pypi || {}
  const npm = live.npm || {}
  const repos = live.repos || []
  const social = live.social_accounts || []
  const intel = identity.intel || {}
  const tokens = intel.tokens || {}

  const anchorCards = [
    github.found ? `
      <div class="card pad">
        <div class="panel-head"><h3>GitHub · verified live</h3><div class="right">${provenanceBadge('live')}</div></div>
        <div style="display:flex;gap:14px;align-items:center">
          ${github.avatar_url ? '<div class="avatar" style="width:64px;height:64px"><img src="' + escape(github.avatar_url) + '" alt=""></div>' : '<div class="avatar" style="width:64px;height:64px">' + escape(initials(github.username)) + '</div>'}
          <div>
            <div style="font-size:17px;font-weight:600">${escape(github.name || github.username)}</div>
            <div class="mono" style="color:var(--text-mute)">${escape(github.url || '')}</div>
            ${github.bio ? '<div class="hint" style="margin-top:6px">' + escape(github.bio) + '</div>' : ''}
          </div>
        </div>
        <div class="grid cols-3" style="margin-top:16px;gap:10px">
          <div><div class="k-label" style="font-size:10.5px">Followers</div><div>${num(github.followers)}</div></div>
          <div><div class="k-label" style="font-size:10.5px">Public repos</div><div>${num(github.public_repos)}</div></div>
          <div><div class="k-label" style="font-size:10.5px">Account age</div><div>${escape(github.account_age_years || '—')} yrs</div></div>
        </div>
        <dl class="kv" style="margin-top:14px">
          ${github.company ? '<dt>Company</dt><dd>' + escape(github.company) + '</dd>' : ''}
          ${github.location ? '<dt>Location</dt><dd>' + escape(github.location) + '</dd>' : ''}
          ${github.blog ? '<dt>Website</dt><dd><a href="' + escape(github.blog) + '" target="_blank" rel="noopener">' + escape(github.blog) + '</a></dd>' : ''}
          ${github.twitter_username ? '<dt>Twitter</dt><dd>@' + escape(github.twitter_username) + '</dd>' : ''}
          ${github.created_at ? '<dt>Joined</dt><dd>' + escape(new Date(github.created_at).toLocaleDateString()) + '</dd>' : ''}
        </dl>
      </div>` : '',
    pypi.found ? `
      <div class="card pad">
        <div class="panel-head"><h3>PyPI · verified live</h3><div class="right">${provenanceBadge('live')}</div></div>
        <dl class="kv">
          <dt>Profile</dt><dd><a href="${escape(pypi.url)}" target="_blank" rel="noopener">${escape(pypi.url)}</a></dd>
          <dt>Packages</dt><dd>${num(pypi.package_count)}</dd>
          ${pypi.joined ? '<dt>Date joined</dt><dd>' + escape(pypi.joined) + '</dd>' : ''}
        </dl>
        ${(pypi.packages || []).length ? '<div class="tag-list" style="margin-top:12px">' + pypi.packages.slice(0, 12).map(item => '<span class="tag">' + escape(item.name) + (item.version ? ' <b>' + escape(item.version) + '</b>' : '') + '</span>').join('') + '</div>' : '<div class="hint" style="margin-top:10px">No public packages listed.</div>'}
      </div>` : '',
    npm.found ? `
      <div class="card pad">
        <div class="panel-head"><h3>npm registry · verified live</h3><div class="right">${provenanceBadge('live')}</div></div>
        <dl class="kv">
          <dt>Packages found</dt><dd>${num(npm.package_count)} (${num(npm.owned_count)} owned)</dd>
          <dt>Registry profile</dt><dd><a href="${escape(npm.url)}" target="_blank" rel="noopener">${escape(npm.url)}</a></dd>
        </dl>
        ${(npm.packages || []).length ? '<div class="tag-list" style="margin-top:12px">' + npm.packages.slice(0, 10).map(item => '<span class="tag">' + escape(item.name) + ' <b>' + compact(Math.round((item.score || 0))) + '</b></span>').join('') + '</div>' : ''}
      </div>` : ''
  ].filter(Boolean).join('')

  return `
  <div class="grid cols-2">
    <div class="card pad">
      <div class="panel-head"><h3>Behavioural profile</h3><div class="right"><span class="hint">heuristic</span></div></div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:14px">
        ${ring(identity.confidence || 0, 104, 8).replace('Exposure', 'Confidence')}
        <div>
          <div style="font-size:19px;font-weight:600">${escape(identity.label || 'Unknown')}</div>
          <div class="hint">Most likely account archetype inferred from the handle structure.</div>
        </div>
      </div>
      <dl class="kv">
        <dt>Handle</dt><dd>${escape(identity.intel ? identity.target || '' : '')}</dd>
        ${(identity.affinity || []).length ? '<dt>Likely interests</dt><dd>' + escape(identity.affinity.join(', ')) + '</dd>' : ''}
        ${(identity.signals || []).length ? '<dt>Signals</dt><dd>' + identity.signals.map(item => escape(item.trait) + ' <span class="hint">+' + escape(item.weight) + '</span>').join('<br>') + '</dd>' : ''}
        ${(intel.ages || []).length ? '<dt>Possible age</dt><dd>' + intel.ages.map(item => escape(String(item.age) + ' (from ' + item.found + ')')).join(', ') + '</dd>' : ''}
      </dl>
      ${(intel.origins || []).length ? '<div class="label" style="margin-top:16px">Name origins</div><div class="tag-list">' + intel.origins.slice(0, 10).map(origin => '<span class="tag">' + escape(origin.name || origin.similar) + ' <b>' + escape(origin.origin) + '</b> · ' + escape(origin.gender) + '</span>').join('') + '</div>' : ''}
    </div>
    <div class="card pad">
      <div class="panel-head"><h3>Handle tokenisation</h3><div class="right"><span class="hint">offline analysis</span></div></div>
      ${tokens && Object.keys(tokens).some(key => (tokens[key] || []).length)
        ? Object.entries(tokens).map(([key, list]) => (list && list.length)
          ? '<div style="margin-bottom:10px"><div class="label" style="margin-bottom:6px">' + escape(key) + '</div><div class="tag-list">' + list.slice(0, 14).map(item => '<span class="tag">' + escape(item) + '</span>').join('') + '</div></div>'
          : '').join('')
        : '<div class="hint">No sub-tokens could be isolated from this handle.</div>'}
      <div class="label" style="margin-top:18px">Suggested looks-ups</div>
      <div class="tag-list">
        <span class="tag">${escape(caseObject.targets[0])} @ gmail.com</span>
        <span class="tag">${escape(caseObject.targets[0])}-dev</span>
        <span class="tag">real name reversal</span>
      </div>
    </div>
  </div>

  ${anchorCards ? '<div class="section-title"><h2>First-party anchors</h2><div class="line"></div></div><div class="grid cols-2">' + anchorCards + '</div>' : ''}

  ${repos.length ? `
  <div class="section-title"><h2>Recent repositories</h2><div class="line"></div><span class="hint">${repos.length} loaded from the GitHub API</span></div>
  <div class="card table-wrap"><table class="data">
    <thead><tr><th>Repository</th><th>Language</th><th>Stars</th><th>Forks</th><th>Updated</th></tr></thead>
    <tbody>${repos.map(repo => `<tr>
      <td><a href="${escape(repo.url)}" target="_blank" rel="noopener"><strong>${escape(repo.name)}</strong></a>${repo.description ? '<div class="hint">' + escape(String(repo.description).slice(0, 110)) + '</div>' : ''}</td>
      <td>${escape(repo.language || '—')}</td>
      <td class="mono">${num(repo.stars)}</td>
      <td class="mono">${num(repo.forks)}</td>
      <td>${escape(timeAgo(Date.parse(repo.updated_at)))}</td></tr>`).join('')}</tbody>
  </table></div>` : ''}

  ${social.length ? `
  <div class="section-title"><h2>Declared external accounts</h2><div class="line"></div><span class="hint">from the GitHub social-accounts API</span></div>
  <div class="grid cols-3">${social.map(account => `
    <div class="card pad"><div class="k-label" style="font-size:11px">${escape(account.provider)}</div>
      <div style="margin:8px 0 6px"><a href="${escape(account.url)}" target="_blank" rel="noopener">${escape(account.url)}</a></div>
      <div class="hint">handle: ${escape(account.handle)}</div></div>`).join('')}</div>` : ''}

  ${(!anchorCards && !repos.length) ? '<div class="empty" style="margin-top:20px">No first-party anchor matched this handle. Try the corporate handle or a linked email.</div>' : ''}`
}

function distributionPane (detail, caseObject) {
  const stats = detail.stats || {}
  const histogram = stats.rating_histogram || {}
  const histogramItems = Object.entries(histogram).map(([name, count]) => ({ name: name + '%', count }))
  const statuses = stats.status_counts || {}
  const profiles = detail.profiles || []
  const languages = Object.entries(profiles.reduce((accumulator, profile) => {
    const key = profile.language || 'unknown'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)

  return `
  <div class="grid cols-3">
    <div class="card kpi"><div class="k-label">Detected</div><div class="k-value" style="color:var(--good)">${num(statuses.good || 0)}</div><div class="k-sub">100% rating</div></div>
    <div class="card kpi"><div class="k-label">Possible</div><div class="k-value" style="color:var(--maybe)">${num(statuses.maybe || 0)}</div><div class="k-sub">50–99% rating</div></div>
    <div class="card kpi"><div class="k-label">Weak</div><div class="k-value" style="color:var(--bad)">${num(statuses.bad || 0)}</div><div class="k-sub">under 50% rating</div></div>
  </div>
  <div class="grid cols-3" style="margin-top:18px">
    <div class="card pad"><div class="panel-head"><h3>Rating distribution</h3></div>${barList(histogramItems)}</div>
    <div class="card pad"><div class="panel-head"><h3>Top categories</h3></div>${barList(stats.by_category || [], { limit: 9, alt: true })}</div>
    <div class="card pad"><div class="panel-head"><h3>Geographic spread</h3></div>${barList(stats.by_country || [], { limit: 9 })}</div>
  </div>
  <div class="grid cols-2" style="margin-top:18px">
    <div class="card pad"><div class="panel-head"><h3>Languages seen</h3></div>${barList(languages, { limit: 8, alt: true })}</div>
    <div class="card pad"><div class="panel-head"><h3>Rank profile</h3><div class="right"><span class="hint">platform popularity of hits</span></div></div>
      ${barList((detail.profiles || []).filter(profile => Number(profile.rank) > 0).slice(0, 8).map(profile => ({ name: profile.site + ' (' + profile.rank + ')', count: rateOf(profile) })), { limit: 8 })}
      <div class="hint" style="margin-top:10px">Bars show detection confidence (%) for the eight highest-ranked platforms carrying this handle.</div>
    </div>
  </div>`
}

function graphPane (detail) {
  const graph = detail.graph || { nodes: [], links: [] }
  return `
  <div class="card pad">
    <div class="panel-head"><h3>Identity link graph</h3><div class="right">
      <span class="legend"><span><i style="background:#f1d69a"></i>target</span>
      <span><i style="background:#5b8cff"></i>live source</span>
      <span><i style="background:#35d39a"></i>first-party API</span>
      <span><i style="background:#d8a954"></i>declared account</span>
      <span><i style="background:rgba(160,107,255,.75)"></i>sandbox source</span></span>
    </div></div>
    <div class="graph-wrap">${forceGraph(graph)}</div>
    <div class="hint" style="margin-top:12px">Nodes are platforms and first-party APIs; edges indicate the same handle or a declared link. Sandbox nodes are dimmed.</div>
  </div>`
}

function clearedPane (detail) {
  const cleared = detail.cleared || []
  const unreachable = detail.unreachable || []
  return `
  <div class="two-col">
    <div class="card">
      <div class="card-head"><h3>Checked, no account found</h3><div class="spacer"></div><span class="hint">${cleared.length} sources</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Platform</th><th>Rank</th><th>Method</th><th>Source</th></tr></thead>
        <tbody>${cleared.length ? cleared.map(item => `<tr>
          <td><strong>${escape(item.site)}</strong></td>
          <td class="mono">${escape(item.rank || '—')}</td>
          <td>${escape(item.status || 'checked')}</td>
          <td>${provenanceBadge(item.provenance)}</td></tr>`).join('') : '<tr><td colspan="4" class="hint">No cleared sources recorded.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Blocked / inconclusive</h3><div class="spacer"></div><span class="hint">${unreachable.length} sources</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Platform</th><th>Reason</th><th>Rank</th></tr></thead>
        <tbody>${unreachable.length ? unreachable.map(item => `<tr>
          <td><strong>${escape(item.site)}</strong></td>
          <td class="mono">${escape(item.error || 'unreachable')}</td>
          <td class="mono">${escape(item.rank || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="hint">Nothing blocked - every source answered.</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`
}

function notesPane (caseObject, detail) {
  const engine = caseObject.engine || {}
  const snapshot = caseObject.settings_snapshot || {}
  return `
  <div class="two-col">
    <div class="card pad">
      <div class="panel-head"><h3>Analyst notes</h3><div class="right"><button class="btn ghost small" data-export="md" data-case="${escape(caseObject.id)}">${icon('download')} Report</button></div></div>
      <div class="timeline">${(caseObject.notes || []).map(note => '<div class="tl-item"><span>' + escape(note) + '</span></div>').join('') || '<div class="hint">No notes.</div>'}</div>
      <div class="label" style="margin-top:20px">Coverage</div>
      <dl class="kv">
        <dt>Sources requested</dt><dd>${num((caseObject.coverage || {}).sources_requested)}</dd>
        <dt>Sources scanned</dt><dd>${num((caseObject.coverage || {}).sources_scanned)}</dd>
        <dt>Answered</dt><dd>${num((caseObject.coverage || {}).reachable)}</dd>
        <dt>Unreachable</dt><dd>${num((caseObject.coverage || {}).blocked)}</dd>
        <dt>Live findings</dt><dd>${num((caseObject.coverage || {}).live_findings)}</dd>
        <dt>Sandbox findings</dt><dd>${num((caseObject.coverage || {}).simulated_findings)}</dd>
      </dl>
    </div>
    <div class="card pad">
      <div class="panel-head"><h3>Engine & run configuration</h3></div>
      <dl class="kv">
        <dt>Engine</dt><dd>${escape(engine.name)} ${escape(engine.version)}</dd>
        <dt>Detection level</dt><dd>${escape(engine.detection_level)}</dd>
        <dt>Detection techniques</dt><dd>${num(engine.detection_techniques)}</dd>
        <dt>Platforms in database</dt><dd>${num(engine.sites_in_database)}</dd>
        <dt>Workers</dt><dd>${num(engine.workers)}</dd>
        <dt>Mode</dt><dd>${escape(caseObject.mode)}</dd>
        <dt>Operator</dt><dd>${escape(caseObject.operator || 'analyst')}</dd>
        <dt>Timeout / source</dt><dd>${num(snapshot.per_site_timeout_ms)} ms</dd>
        <dt>Proxy</dt><dd>${snapshot.proxy_configured ? 'configured' : 'none'}</dd>
        <dt>GitHub token</dt><dd>${snapshot.github_token_configured ? 'configured' : 'anonymous (rate-limited)'}</dd>
        <dt>Metadata extraction</dt><dd>${snapshot.metadata ? 'on' : 'off'}</dd>
        <dt>Pattern extraction</dt><dd>${snapshot.extraction ? 'on' : 'off'}</dd>
        <dt>Sandbox fallback</dt><dd>${snapshot.allow_synthetic ? 'on' : 'off'}</dd>
        <dt>Duration</dt><dd>${escape(duration(caseObject.duration_ms))}</dd>
      </dl>
      <div class="callout" style="margin-top:18px">Ratings follow the upstream engine: each detection technique either matches or not,
      and the resulting ratio becomes the 0–100 confidence. Ratings of 100% with the "detected" status are the only ones treated as confirmed
      in the executive summary.</div>
    </div>
  </div>`
}

/* ----------------------------------------------------------------- library */

export function libraryView () {
  const cases = store.cases || []
  const totalProfiles = cases.reduce((sum, item) => sum + ((item.summary && item.summary.profiles_found) || 0), 0)
  const liveFindings = cases.reduce((sum, item) => sum + ((item.summary && item.summary.live_findings) || 0), 0)
  return `
  <div class="section-title" style="margin-top:0"><h2>Case library</h2><div class="line"></div>
    <div class="right">
      <button class="btn ghost small" id="refresh-cases">${icon('refresh')} Refresh</button>
      <button class="btn ghost small danger" id="clear-cases">${icon('trash')} Clear all</button>
    </div></div>
  <div class="grid cols-4">
    <div class="card kpi"><div class="k-label">Cases</div><div class="k-value">${num(cases.length)}</div><div class="k-sub">stored server-side</div></div>
    <div class="card kpi"><div class="k-label">Profiles catalogued</div><div class="k-value">${num(totalProfiles)}</div><div class="k-sub">across all cases</div></div>
    <div class="card kpi"><div class="k-label">Live findings</div><div class="k-value" style="color:var(--live)">${num(liveFindings)}</div><div class="k-sub">real responses</div></div>
    <div class="card kpi"><div class="k-label">Unique targets</div><div class="k-value">${num(new Set(cases.flatMap(item => item.targets || [])).size)}</div><div class="k-sub">handles investigated</div></div>
  </div>
  <div class="card table-wrap" style="margin-top:20px">
    <table class="data">
      <thead><tr><th>Case</th><th>Targets</th><th>Findings</th><th>Live / sandbox</th><th>Exposure</th><th>Coverage</th><th>When</th><th></th></tr></thead>
      <tbody>${cases.length ? cases.map(item => {
        const summary = item.summary || {}
        return `<tr>
          <td><strong class="mono">${escape(item.id)}</strong><div class="hint">${escape(item.mode || '')} mode</div></td>
          <td>${(item.targets || []).map(target => '<span class="tag">' + escape(target) + '</span>').join(' ')}</td>
          <td class="mono">${num(summary.profiles_found || 0)}</td>
          <td><span class="badge live">${num(summary.live_findings || 0)}</span> <span class="badge sim">${num(summary.simulated_findings || 0)}</span></td>
          <td class="mono">${num(summary.exposure_score || 0)}/100</td>
          <td class="mono">${num(summary.coverage_percent || 0)}%</td>
          <td>${escape(timeAgo(item.created_at))}</td>
          <td style="white-space:nowrap">
            <button class="btn ghost small" data-open-case="${escape(item.id)}">Open</button>
            <button class="btn ghost small" data-export="json" data-case="${escape(item.id)}">${icon('download')}</button>
            <button class="btn ghost small danger" data-delete-case="${escape(item.id)}">${icon('trash')}</button>
          </td></tr>`
      }).join('') : '<tr><td colspan="8" class="hint" style="padding:28px;text-align:center">No cases yet - launch an investigation from the dashboard.</td></tr>'}</tbody>
    </table>
  </div>`
}

/* ----------------------------------------------------------------- sources */

export function sourcesView () {
  const facets = store.facets || { categories: [], countries: [] }
  const sites = store.sites || []
  return `
  <div class="section-title" style="margin-top:0"><h2>Source database</h2><div class="line"></div>
    <div class="right">
      <span class="hint" id="sites-count">${sites.length} shown</span>
      <button class="btn ghost small" id="sites-select-top">Select visible</button>
      <button class="btn ghost small" id="sites-clear">Clear</button>
      <button class="btn primary small" id="sites-run">${icon('target')} Investigate selection</button>
    </div></div>

  <div class="card pad">
    <div class="toolbar">
      <div class="search-field" style="flex:0 0 260px;max-width:260px">${icon('search')}
        <input class="input" id="sites-search" placeholder="Search platform or category…" style="padding-left:44px"></div>
      <select class="select" id="sites-category" style="min-width:220px">
        <option value="">All categories</option>
        ${facets.categories.slice(0, 80).map(item => '<option value="' + escape(item.name) + '">' + escape(item.name) + ' (' + item.count + ')</option>').join('')}
      </select>
      <select class="select" id="sites-country" style="min-width:170px">
        <option value="">All countries</option>
        ${facets.countries.slice(0, 60).map(item => '<option value="' + escape(item.name) + '">' + escape(item.name) + ' (' + item.count + ')</option>').join('')}
      </select>
      <select class="select" id="sites-nsfw" style="min-width:150px">
        <option value="exclude">Hide adult</option>
        <option value="include">Include adult</option>
        <option value="only">Adult only</option>
      </select>
      <select class="select" id="sites-sort" style="min-width:150px">
        <option value="rank">Sort: popularity</option>
        <option value="name">Sort: name</option>
        <option value="category">Sort: category</option>
      </select>
    </div>
  </div>

  <div class="card table-wrap" style="margin-top:16px;max-height:620px;overflow-y:auto">
    <table class="data">
      <thead><tr><th style="width:38px"></th><th>Platform</th><th>Category</th><th>Country</th><th>Rank</th><th>Detections</th><th>Live API</th></tr></thead>
      <tbody id="sites-body">${siteRows(sites)}</tbody>
    </table>
  </div>
  <div class="hint" style="margin-top:12px">${store.selection.sites.size} source(s) manually selected. Presets from the dashboard are applied on top of this selection.</div>`
}

export function siteRows (sites) {
  if (!sites.length) return '<tr><td colspan="7" class="hint" style="padding:28px;text-align:center">No platforms match these filters.</td></tr>'
  return sites.map(site => `
    <tr>
      <td><input type="checkbox" class="site-check" data-index="${site.index}" ${store.selection.sites.has(site.index) ? 'checked' : ''}></td>
      <td><strong>${escape(site.host)}</strong>${site.nsfw ? ' <span class="badge bad">18+</span>' : ''}
        <div class="hint mono" style="font-size:11px">${escape(site.url_template)}</div></td>
      <td>${escape(String(site.category).split(' > ')[0])}</td>
      <td>${escape(site.country)}</td>
      <td class="mono">${site.rank ? escape(site.rank) : '—'}</td>
      <td class="mono">${(site.detections || []).length}</td>
      <td>${site.live_connector ? '<span class="badge live">' + icon('bolt') + 'api</span>' : '<span class="hint">—</span>'}</td>
    </tr>`).join('')
}

/* ----------------------------------------------------------------- network */

export function networkView () {
  const probe = store.probe || { summary: {}, results: [] }
  const summary = probe.summary || {}
  const connectors = (store.overview && store.overview.connectors) || []
  const database = (store.overview && store.overview.database) || {}
  const health = store.health || {}
  return `
  <div class="section-title" style="margin-top:0"><h2>Network & egress status</h2><div class="line"></div>
    <div class="right">
      <span class="hint">checked ${escape(timeAgo(summary.checked_at))}</span>
      <button class="btn ghost small" id="reprobe">${icon('refresh')} Re-run probes</button>
    </div></div>

  <div class="grid cols-4">
    <div class="card kpi"><div class="k-label">Hosts probed</div><div class="k-value">${num(summary.checked || 0)}</div><div class="k-sub">top-traffic sample</div></div>
    <div class="card kpi"><div class="k-label">Reachable</div><div class="k-value" style="color:var(--good)">${num(summary.reachable || 0)}</div><div class="k-sub">HTTP answer received</div></div>
    <div class="card kpi"><div class="k-label">Filtered</div><div class="k-value" style="color:var(--bad)">${num(summary.blocked || 0)}</div><div class="k-sub">${escape(Object.keys(summary.block_reasons || {}).join(', ') || 'no blocks')}</div></div>
    <div class="card kpi"><div class="k-label">Egress profile</div><div class="k-value" style="font-size:22px">${summary.egress_open ? 'Open' : 'Restricted'}</div><div class="k-sub">median ${num(summary.median_latency_ms || 0)} ms</div></div>
  </div>

  <div class="${summary.egress_open ? 'notice live' : 'notice warn'}" style="margin-top:18px">
    ${icon(summary.egress_open ? 'bolt' : 'warn')}
    <div>${summary.egress_open
      ? '<b>Open egress.</b> Almost every source answers directly, so cases will be fully live.'
      : '<b>Restricted egress detected.</b> This deployment can only reach the hosts below. Everything else is filled with badged sandbox fixtures when Hybrid mode is on. Set a proxy in <b>Settings</b> (HTTP/SOCKS) or run the app where outbound traffic is open to collect fully live cases.'}
      <div class="hint" style="margin-top:6px">Detection engine: ${escape((health.engine && health.engine.name) || 'social-analyzer')} ${escape((health.engine && health.engine.version) || '')} ·
      node ${escape(health.node || '')} · uptime ${num(health.uptime_s || 0)}s · ${num(database.sites || 0)} platforms / ${num(database.detections || 0)} techniques</div>
    </div>
  </div>

  <div class="two-col" style="margin-top:20px">
    <div class="card table-wrap">
      <div class="card-head"><h3>Probe results</h3><div class="spacer"></div><span class="hint">live HTTP checks</span></div>
      <table class="data">
        <thead><tr><th>Host</th><th>Status</th><th>Latency</th><th>Reason</th></tr></thead>
        <tbody>${(probe.results || []).map(result => `<tr>
          <td><strong>${escape(result.host)}</strong></td>
          <td>${result.ok ? '<span class="badge good">reachable</span>' : '<span class="badge bad">filtered</span>'}</td>
          <td class="mono">${num(result.latency_ms)} ms</td>
          <td class="mono">${escape(result.reason || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">Probing…</td></tr>'}</tbody>
      </table>
    </div>
    <div>
      <div class="card pad">
        <div class="panel-head"><h3>Verified connectors</h3><div class="right"><span class="hint">official endpoints</span></div></div>
        ${connectors.map(connector => `
          <div class="switch-row">
            <div><div class="sr-label">${escape(connector.label)}</div>
              <div class="sr-desc mono">${escape(connector.api)}</div></div>
            <button class="btn ghost small" data-lookup="${escape(connector.id)}">Test handle</button>
          </div>`).join('')}
      </div>
      <div class="card pad" style="margin-top:16px">
        <div class="panel-head"><h3>Diagnostics</h3></div>
        <dl class="kv">
          <dt>Node runtime</dt><dd>${escape(health.node || '—')}</dd>
          <dt>Server uptime</dt><dd>${num(health.uptime_s || 0)} s</dd>
          <dt>Cases stored</dt><dd>${num((health.cases && health.cases.cases) || 0)}</dd>
          <dt>Case directory</dt><dd class="mono">${escape((health.cases && health.cases.storage_dir) || 'runtime/cases')}</dd>
          <dt>Proxy</dt><dd>${health.settings && health.settings.proxy ? escape(health.settings.proxy) : 'not configured'}</dd>
          <dt>GitHub token</dt><dd>${health.settings && health.settings.has_github_token ? 'configured' : 'anonymous'}</dd>
        </dl>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn ghost small" id="open-settings">${icon('settings')} Open settings</button>
          <button class="btn ghost small" data-goto="api">${icon('code')} API reference</button>
        </div>
      </div>
    </div>
  </div>`
}

/* --------------------------------------------------------------------- api */

const ENDPOINTS = [
  ['GET', '/api/health', 'Status, engine versions, database counters, egress probe summary and public settings.'],
  ['GET', '/api/overview', 'Dashboard aggregates: presets, connectors, case statistics and 14-day activity.'],
  ['GET', '/api/sites', 'The source database. Filters: search, category, country, nsfw, connector, sort, limit.'],
  ['GET', '/api/presets', 'Curated source presets (top-10/25/50/100, categories).'],
  ['GET', '/api/facets', 'Category and country facets with counts.'],
  ['GET', '/api/probe', 'Re-runs the reachability probes (add ?force=1 to bypass the 10-minute cache).'],
  ['POST', '/api/scan/preview', 'Estimates sources, runtime and first-party coverage before a run.'],
  ['POST', '/api/scan', 'Starts an investigation. Body: targets, presets, sites, mode, max_sites, per_site_timeout_ms, concurrency.'],
  ['GET', '/api/stream/:job', 'Server-sent events for a job: snapshot, log, progress, done / error / cancelled.'],
  ['POST', '/api/scan/:job/cancel', 'Requests cancellation of a running investigation.'],
  ['GET', '/api/cases', 'Case library index with summary metrics.'],
  ['GET', '/api/cases/:id', 'Full case file (targets, findings, cleared sources, stats, notes, engine info).'],
  ['GET', '/api/cases/:id/export?format=json|csv|md', 'Case export for hand-off or archival.'],
  ['DELETE', '/api/cases/:id', 'Deletes a stored case.'],
  ['GET', '/api/settings', 'Current server-side settings (tokens masked).'],
  ['POST', '/api/settings', 'Updates settings: proxy, user-agent, tokens, module toggles, default sources.'],
  ['POST', '/api/lookup/:handle', 'First-party enrichment through GitHub, PyPI and npm.'],
  ['GET', '/api/identity/:handle', 'Offline handle intelligence: tokenisation, name origins, possible age.']
]

export function apiView () {
  const curl = `curl -s -X POST http://localhost:9005/api/scan \\
  -H 'Content-Type: application/json' \\
  -d '{"targets":"torvalds","presets":["top25"],"mode":"auto"}'`
  const cli = `# classic CLI (upstream engine)
node app.js --username "torvalds" --metadata
node app.js --username "torvalds,linus" --top 50
node app.js --username "torvalds" --type "adult"
node app.js --list`
  return `
  <div class="section-title" style="margin-top:0"><h2>API & CLI reference</h2><div class="line"></div>
    <div class="right"><span class="hint">REST + server-sent events on the same port as the console</span></div></div>

  <div class="two-col">
    <div class="card pad">
      <div class="panel-head"><h3>Endpoints</h3></div>
      ${ENDPOINTS.map(([method, path, description]) => `
        <div class="doc-row">
          <span class="doc-method">${method}</span>
          <div><div class="doc-path">${escape(path)}</div><div class="doc-desc">${escape(description)}</div></div>
          <button class="btn ghost small" style="margin-left:auto" data-copy="${escape(method + ' ' + path)}">${icon('copy')}</button>
        </div>`).join('')}
    </div>
    <div>
      <div class="card pad">
        <div class="panel-head"><h3>Launch a case over HTTP</h3>
          <div class="right"><button class="btn ghost small" data-copy="${escape(curl)}">${icon('copy')} Copy</button></div></div>
        <pre class="json">${escape(curl)}</pre>
        <div class="hint" style="margin-top:10px">The response contains a job id. Subscribe to
        <code>/api/stream/&lt;job&gt;</code> for live events; the finished case is available at <code>/api/cases/&lt;id&gt;</code>.</div>
      </div>
      <div class="card pad" style="margin-top:16px">
        <div class="panel-head"><h3>Classic CLI & engine</h3>
          <div class="right"><button class="btn ghost small" data-copy="${escape(cli)}">${icon('copy')} Copy</button></div></div>
        <pre class="json">${escape(cli)}</pre>
        <div class="hint" style="margin-top:10px">The original console remains available at <a href="/app.html">/app.html</a> and the
        upstream engine is untouched, so existing scripts keep working.</div>
      </div>
    </div>
  </div>`
}

/* ------------------------------------------------------------------- about */

export function aboutView () {
  const database = (store.overview && store.overview.database) || {}
  return `
  <div class="section-title" style="margin-top:0"><h2>About Head Hunter Agency</h2><div class="line"></div></div>
  <div class="two-col">
    <div class="card pad">
      <h3 style="font-family:var(--font-display);font-size:22px;margin-bottom:10px">A console for the social-analyzer engine</h3>
      <p class="hint" style="margin-bottom:14px">Head Hunter Agency wraps the open-source <b>qeeqbox/social-analyzer</b> engine
      (AGPL-3.0, ${num(database.sites || 999)} platforms, ${num(database.detections || 1821)} detection techniques) in an analyst workflow:
      target intake, source selection, live streaming, first-party verification, case files and exports.</p>
      <div class="callout" style="margin-bottom:16px">Detection ratings follow the upstream methodology: a 0–100 score where every technique
      either matches or does not, and the ratio becomes the confidence. 100% + "detected" is treated as confirmed; 50–99% is "possible".</div>
      <div class="label">How to read provenance</div>
      <div class="switch-row"><div><div class="sr-label">${provenanceBadge('live')} live</div>
        <div class="sr-desc">A real HTTPS response was captured during this run and parsed by the detection engine.</div></div></div>
      <div class="switch-row"><div><div class="sr-label">${provenanceBadge('synthetic')} sandbox</div>
        <div class="sr-desc">Deterministic offline fixture for a source that could not be reached. Clearly badged, never evidence.</div></div></div>
      <div class="switch-row"><div><div class="sr-label"><span class="badge neutral">challenge</span> inconclusive</div>
        <div class="sr-desc">The host answered with an anti-bot / JavaScript interstitial, so no profile data could be read.</div></div></div>
      <div class="switch-row"><div><div class="sr-label"><span class="badge bad">blocked</span> unreachable</div>
        <div class="sr-desc">Connection refused, reset, DNS or timeout - reported honestly instead of guessed.</div></div></div>
    </div>
    <div>
      <div class="card pad">
        <div class="panel-head"><h3>Responsible use</h3></div>
        <p class="hint">This tool queries publicly available pages and official public APIs. It is intended for security research,
        brand protection, fraud and due-diligence investigations, journalism and law-enforcement work performed under lawful authority.</p>
        <div class="callout" style="margin-top:14px">You are responsible for complying with the terms of service of each platform you query,
        with data-protection law (GDPR/CCPA and equivalents) and with any local restrictions on OSINT collection. Do not use it to harass,
        stalk, dox or discriminate against individuals.</div>
        <div class="tag-list" style="margin-top:16px">
          <span class="tag">Public sources only</span>
          <span class="tag">No credential use</span>
          <span class="tag">No authentication bypass</span>
          <span class="tag">Rate-limited probes</span>
        </div>
      </div>
      <div class="card pad" style="margin-top:16px">
        <div class="panel-head"><h3>Credits</h3></div>
        <dl class="kv">
          <dt>Detection engine</dt><dd>social-analyzer by QeeqBox (AGPL-3.0)</dd>
          <dt>Interface</dt><dd>Head Hunter Agency console</dd>
          <dt>Classic console</dt><dd><a href="/app.html">/app.html</a></dd>
          <dt>Repository</dt><dd><a href="https://github.com/qeeqbox/social-analyzer" target="_blank" rel="noopener">github.com/qeeqbox/social-analyzer</a></dd>
        </dl>
      </div>
    </div>
  </div>`
}

/* ------------------------------------------------------------- helpers ---- */

export function caseRowCompact (item) {
  const summary = item.summary || {}
  return `<tr>
    <td><strong class="mono">${escape(item.id)}</strong><div class="hint">${escape((item.targets || []).join(', '))}</div></td>
    <td class="mono">${num(summary.profiles_found || 0)}</td>
    <td><span class="badge live">${num(summary.live_findings || 0)}</span></td>
    <td class="mono">${num(summary.exposure_score || 0)}</td>
    <td>${escape(timeAgo(item.created_at))}</td>
    <td><button class="btn ghost small" data-open-case="${escape(item.id)}">Open</button></td>
  </tr>`
}

export { clock, duration, rateOf }
