// Persistent server-side queue for triage actions, with an in-process worker.
//
// The route enqueues and returns immediately; the worker runs each job through an
// injected executor (see triageExecutors.js). State lives in queue/actions.json,
// resolved lazily from process.cwd(), and is written atomically on every state
// transition. Progress writes are throttled to one per second per job.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./atomicWrite.js";
import { ACTION_DISPATCH } from "./triageApi.js";

const RETAIN_FINISHED = 200;
const PROGRESS_WRITE_MS = 1000;
const SINGLE_MESSAGE_ACTIONS = new Set(["archive", "delete", "review"]);

export class QueueError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "QueueError";
    this.code = code;
  }
}

let jobs = null; // null until loaded
let paused = null; // null | "gmail_auth"
let pauseTimer = null;
let worker = null; // null when stopped
const running = new Set(); // ids of jobs with an executor in flight
const lastProgressWrite = new Map(); // job id -> ms of last write
const undoing = new Set(); // ids of done jobs whose undo is in flight (not persisted)

function queueFile() {
  return path.join(process.cwd(), "queue", "actions.json");
}

function persist() {
  const file = queueFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, JSON.stringify({ jobs }, null, 2));
}

// Worker-side writes must never turn a disk problem into an unhandled rejection.
function persistQuietly() {
  try {
    persist();
  } catch (e) {
    console.error("[queue] persist failed:", e.message);
  }
}

export function loadQueue() {
  let loaded = [];
  try {
    loaded = JSON.parse(fs.readFileSync(queueFile(), "utf8")).jobs;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const j of loaded) {
    if (j.status === "running") j.status = "pending";
  }
  jobs = loaded;
}

function all() {
  if (jobs === null) loadQueue();
  return jobs;
}

function find(id) {
  const job = all().find((j) => j.id === id);
  if (!job) throw new QueueError("not_found", "job not found");
  return job;
}

export function __resetQueueForTests() {
  stopQueueWorker();
  jobs = null;
  paused = null;
  lastProgressWrite.clear();
  undoing.clear();
  loadQueue();
}

function isUndoable(job) {
  return ACTION_DISPATCH[job.action].undo !== "none";
}

function clearPause() {
  paused = null;
  if (pauseTimer) clearTimeout(pauseTimer);
  pauseTimer = null;
}

export function enqueueJob(fields) {
  const list = all();
  const job = {
    id: crypto.randomUUID(),
    seq: list.reduce((m, j) => Math.max(m, j.seq), 0) + 1,
    action: fields.action,
    msgId: fields.msgId ?? null,
    threadId: fields.threadId ?? null,
    fromEmail: fields.fromEmail ?? null,
    fromName: fields.fromName ?? null,
    subject: fields.subject ?? null,
    unsubUrl: fields.unsubUrl ?? null,
    unsubPost: fields.unsubPost ?? null,
    unsubDone: false,
    status: "pending",
    total: SINGLE_MESSAGE_ACTIONS.has(fields.action) ? 1 : null,
    processed: 0,
    undoRequested: false,
    undo: null,
    result: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  list.push(job);
  persist();
  clearPause();
  pump();
  return job;
}

export function getQueueStatus() {
  const active = all().filter(
    (j) => j.status === "pending" || j.status === "running",
  );
  return {
    actions: active.length,
    emailsLeft: active
      .filter((j) => j.total !== null)
      .reduce((n, j) => n + (j.total - j.processed), 0),
    counting: active.filter((j) => j.total === null).length,
    activeIds: active.map((j) => j.id),
    failed: all().filter((j) => j.status === "failed"),
    paused,
  };
}

export function jobsAffectingSince(sinceMs) {
  return all().filter(
    (j) =>
      j.status === "pending" ||
      j.status === "running" ||
      (j.status === "done" && j.finishedAt >= sinceMs),
  );
}

export async function undoJob(id) {
  const job = find(id);
  if (
    !isUndoable(job) ||
    job.status === "failed" ||
    job.status === "cancelled" ||
    undoing.has(id) // a second click while the first undo is still in flight
  ) {
    throw new QueueError("not_undoable", "action cannot be undone");
  }
  // A pending job that has already started once (auth pause, retry, restart) may
  // have changed Gmail or the lists, so cancelling it would strand that work: let
  // the worker re-run it (idempotent) and then apply the undo.
  const hasRun = job.startedAt !== null;
  if (job.status === "pending" && !hasRun) {
    job.status = "cancelled";
    job.finishedAt = Date.now();
    prune();
    persist();
    pump();
    return { state: "cancelled" };
  }
  if (job.status === "pending" || job.status === "running") {
    job.undoRequested = true;
    persist();
    return { state: "undo-requested" };
  }
  undoing.add(id);
  try {
    await worker.undo(await worker.getGmail(), job.undo);
  } catch (e) {
    undoing.delete(id);
    throw e;
  }
  undoing.delete(id);
  job.status = "cancelled";
  persist();
  return { state: "undone" };
}

export function retryJob(id) {
  const job = find(id);
  if (job.status !== "failed") throw new QueueError("not_found", "no failed job");
  job.status = "pending";
  job.processed = 0;
  job.error = null;
  job.finishedAt = null;
  persist();
  clearPause();
  pump();
}

export function dismissJob(id) {
  const job = find(id);
  if (job.status !== "failed") throw new QueueError("not_found", "no failed job");
  jobs = jobs.filter((j) => j !== job);
  persist();
}

function prune() {
  const finished = all()
    .filter((j) => j.status === "done" || j.status === "cancelled")
    .sort((a, b) => b.finishedAt - a.finishedAt);
  const drop = new Set(finished.slice(RETAIN_FINISHED));
  if (drop.size) jobs = jobs.filter((j) => !drop.has(j));
}

export function startQueueWorker({
  getGmail,
  execute,
  undo,
  isAuthError,
  concurrency = 2,
  pauseMs = 300000,
}) {
  loadQueue();
  clearPause();
  worker = { getGmail, execute, undo, isAuthError, concurrency, pauseMs };
  pump();
}

export function stopQueueWorker() {
  worker = null;
  if (pauseTimer) clearTimeout(pauseTimer);
  pauseTimer = null;
}

// Lowest-seq pending job whose sender has nothing running and nothing earlier
// pending, so jobs for one sender run strictly in click order.
function nextJob() {
  const blocked = new Set(
    all()
      .filter((j) => j.status === "running")
      .map((j) => j.fromEmail?.toLowerCase()),
  );
  const pending = all()
    .filter((j) => j.status === "pending")
    .sort((a, b) => a.seq - b.seq);
  for (const j of pending) {
    const sender = j.fromEmail?.toLowerCase();
    if (!blocked.has(sender)) return j;
    blocked.add(sender);
  }
  return null;
}

function pump() {
  while (worker && !paused && running.size < worker.concurrency) {
    const job = nextJob();
    if (!job) return;
    runJob(job);
  }
}

async function runJob(job) {
  const w = worker;
  job.status = "running";
  job.startedAt = Date.now();
  job.processed = 0;
  running.add(job.id);
  persistQuietly();
  lastProgressWrite.set(job.id, Date.now());

  let hadFailedChunk = false;
  // Called from inside the Gmail helpers' try around batchModify: it must never throw.
  const onProgress = (ev) => {
    try {
      if (ev.total !== undefined) job.total = ev.total;
      if (ev.processed !== undefined) job.processed = ev.processed;
      if (ev.failedChunk) hadFailedChunk = true;
      const now = Date.now();
      if (now - lastProgressWrite.get(job.id) >= PROGRESS_WRITE_MS) {
        lastProgressWrite.set(job.id, now);
        persist();
      }
    } catch (e) {
      console.error("[queue] progress update failed:", e.message);
    }
  };
  const markUnsubDone = () => {
    job.unsubDone = true;
    persistQuietly();
  };
  const markListDecision = (addedToList) => {
    job.addedToList = addedToList;
    persistQuietly();
  };

  try {
    const gmail = await w.getGmail();
    const out = await w.execute(gmail, job, {
      onProgress,
      markUnsubDone,
      markListDecision,
    });
    job.undo = out.undo ?? null;
    job.result = { labeled: out.labeled, ...out.result };
    job.finishedAt = Date.now();
    if (job.undoRequested) {
      await w.undo(gmail, job.undo);
      job.status = "cancelled";
    } else if (hadFailedChunk) {
      job.status = "failed";
      job.error = "partial";
    } else {
      job.status = "done";
    }
  } catch (e) {
    if (w.isAuthError(e)) {
      // startedAt stays set: it records that this job has run, which undoJob needs.
      job.status = "pending";
      job.finishedAt = null;
      paused = "gmail_auth";
      if (pauseTimer) clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        paused = null;
        pump();
      }, w.pauseMs);
      pauseTimer.unref?.();
    } else {
      console.error(`[queue] job ${job.id} (${job.action}) failed:`, e);
      job.status = "failed";
      job.error = "Action failed";
      job.finishedAt = Date.now();
    }
  } finally {
    running.delete(job.id);
    lastProgressWrite.delete(job.id);
    prune();
    persistQuietly();
    pump();
  }
}
