//  -------------------------------------------------------------
//  Head Hunter Agency - investigation job registry (SSE streaming)
//  -------------------------------------------------------------------
//  Jobs hold live progress for an investigation. Every job exposes a
//  server-sent-events stream so the web console can render the pipeline
//  in real time (site checks, live/blocked decisions, findings).
//  -------------------------------------------------------------------

const jobs = new Map()

const MAX_LOG_LINES = 400
const JOB_TTL_MS = 1000 * 60 * 60 * 3 // 3 hours

function now () {
  return Date.now()
}

function create_job (meta = {}) {
  const id = 'job_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4)
  const job = {
    id,
    meta,
    status: 'queued',
    created_at: now(),
    started_at: 0,
    finished_at: 0,
    cancel_requested: false,
    logs: [],
    progress: {
      total: 0,
      checked: 0,
      live: 0,
      blocked: 0,
      found: 0,
      stage: 'queued',
      target: '',
      percent: 0
    },
    subscribers: new Set(),
    result: undefined,
    error: undefined
  }
  jobs.set(id, job)
  schedule_gc()
  return job
}

function get_job (id) {
  return jobs.get(id)
}

function list_jobs () {
  return Array.from(jobs.values()).map(job => ({
    id: job.id,
    status: job.status,
    meta: job.meta,
    created_at: job.created_at,
    progress: job.progress
  }))
}

function emit (job, type, payload = {}) {
  const event = Object.assign({ type, at: now(), job: job.id }, payload)
  if (type === 'log') {
    job.logs.push({ at: event.at, level: payload.level || 'info', message: payload.message, target: payload.target || job.progress.target })
    if (job.logs.length > MAX_LOG_LINES) {
      job.logs = job.logs.slice(-MAX_LOG_LINES)
    }
  }
  if (type === 'progress') {
    job.progress = Object.assign({}, job.progress, payload.progress || {})
    event.progress = job.progress
  }
  const line = 'data: ' + JSON.stringify(event) + '\n\n'
  for (const res of job.subscribers) {
    try {
      res.write(line)
    } catch (err) {
      job.subscribers.delete(res)
    }
  }
  return event
}

function log (job, message, level = 'info', target = undefined) {
  return emit(job, 'log', { message, level, target })
}

function progress (job, patch) {
  job.progress = Object.assign({}, job.progress, patch)
  return emit(job, 'progress', { progress: job.progress })
}

function subscribe (job, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('retry: 2000\n\n')
  // Replay what already happened so a late subscriber is not blind.
  res.write('data: ' + JSON.stringify({
    type: 'snapshot',
    job: job.id,
    status: job.status,
    progress: job.progress,
    meta: job.meta,
    logs: job.logs.slice(-120)
  }) + '\n\n')
  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
    res.write('data: ' + JSON.stringify({ type: job.status, job: job.id, progress: job.progress, result: job.result, error: job.error }) + '\n\n')
  }
  job.subscribers.add(res)
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch (err) {
      clearInterval(ping)
    }
  }, 15000)
  req.on('close', () => {
    clearInterval(ping)
    job.subscribers.delete(res)
  })
}

function finish (job, result) {
  job.status = 'done'
  job.finished_at = now()
  job.result = result
  job.progress = Object.assign({}, job.progress, { percent: 100, stage: 'complete' })
  emit(job, 'done', { progress: job.progress, result, result_summary: result && result.summary ? result.summary : undefined })
  close_all(job)
}

function fail (job, error) {
  job.status = 'error'
  job.finished_at = now()
  job.error = String(error && error.message ? error.message : error)
  emit(job, 'error', { message: job.error, progress: job.progress })
  close_all(job)
}

function cancel (job) {
  job.cancel_requested = true
  job.status = 'cancelled'
  job.finished_at = now()
  emit(job, 'cancelled', { progress: job.progress })
  close_all(job)
}

function close_all (job) {
  for (const res of job.subscribers) {
    try {
      res.end()
    } catch (err) {}
  }
  job.subscribers.clear()
}

function schedule_gc () {
  if (schedule_gc._t) return
  schedule_gc._t = setTimeout(() => {
    schedule_gc._t = null
    const cut = now() - JOB_TTL_MS
    for (const [id, job] of jobs.entries()) {
      if (job.finished_at && job.finished_at < cut) {
        close_all(job)
        jobs.delete(id)
      }
    }
  }, 1000 * 60 * 10)
  if (schedule_gc._t.unref) schedule_gc._t.unref()
}

export default {
  create_job,
  get_job,
  list_jobs,
  emit,
  log,
  progress,
  subscribe,
  finish,
  fail,
  cancel
}
