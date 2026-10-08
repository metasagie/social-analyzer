//  -------------------------------------------------------------
//  Head Hunter Agency - case file storage
//  -------------------------------------------------------------
//  Every investigation is written to a small JSON case file under
//  runtime/cases so it can be re-opened, exported or audited later.
//  The runtime folder is disposable and excluded from version control.
//  -------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const RUNTIME_DIR = path.join(ROOT, 'runtime')
const CASES_DIR = path.join(RUNTIME_DIR, 'cases')
const INDEX_FILE = path.join(CASES_DIR, 'index.json')
const MAX_INDEX_ENTRIES = 500

function ensure_dirs () {
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  if (!fs.existsSync(CASES_DIR)) fs.mkdirSync(CASES_DIR, { recursive: true })
}

function read_index () {
  ensure_dirs()
  try {
    if (!fs.existsSync(INDEX_FILE)) return []
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    return []
  }
}

function write_index (entries) {
  ensure_dirs()
  const trimmed = entries
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_INDEX_ENTRIES)
  fs.writeFileSync(INDEX_FILE, JSON.stringify(trimmed, null, 2))
  return trimmed
}

function safe_id (id) {
  return String(id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
}

function case_path (id) {
  return path.join(CASES_DIR, safe_id(id) + '.json')
}

function save_case (case_object) {
  ensure_dirs()
  const id = safe_id(case_object.id)
  if (!id) throw new Error('case id required')
  const target = Object.assign({}, case_object, { id })
  fs.writeFileSync(case_path(id), JSON.stringify(target, null, 2))
  const index = read_index().filter(entry => entry.id !== id)
  index.push(summarize(target))
  write_index(index)
  return target
}

function summarize (case_object) {
  const summary = case_object.summary || {}
  return {
    id: case_object.id,
    created_at: case_object.created_at || Date.now(),
    targets: case_object.targets || [],
    mode: case_object.mode || 'auto',
    status: case_object.status || 'complete',
    duration_ms: case_object.duration_ms || 0,
    summary: {
      sites_checked: summary.sites_checked || 0,
      profiles_found: summary.profiles_found || 0,
      live_findings: summary.live_findings || 0,
      simulated_findings: summary.simulated_findings || 0,
      high_confidence: summary.high_confidence || 0,
      exposure_score: summary.exposure_score || 0,
      coverage_percent: summary.coverage_percent || 0
    },
    provenance: case_object.provenance || 'unknown',
    operator: case_object.operator || 'analyst'
  }
}

function list_cases () {
  return read_index()
}

function get_case (id) {
  const file = case_path(id)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

function remove_case (id) {
  const file = case_path(id)
  const existed = fs.existsSync(file)
  if (existed) fs.unlinkSync(file)
  write_index(read_index().filter(entry => entry.id !== safe_id(id)))
  return existed
}

function clear_cases () {
  let removed = 0
  for (const entry of read_index()) {
    if (remove_case(entry.id)) removed += 1
  }
  write_index([])
  return removed
}

function stats () {
  const index = read_index()
  const targets = new Set()
  let profiles = 0
  let live = 0
  index.forEach(entry => {
    ;(entry.targets || []).forEach(target => targets.add(target))
    profiles += (entry.summary && entry.summary.profiles_found) || 0
    live += (entry.summary && entry.summary.live_findings) || 0
  })
  return {
    cases: index.length,
    unique_targets: targets.size,
    profiles_catalogued: profiles,
    live_findings: live,
    last_case_at: index.length ? index[0].created_at : 0,
    storage_dir: 'runtime/cases'
  }
}

export default {
  save_case,
  list_cases,
  get_case,
  remove_case,
  clear_cases,
  stats,
  summarize,
  CASES_DIR
}
