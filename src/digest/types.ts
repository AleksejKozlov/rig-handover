// Plan morning-digest § 1. The contract between the reader, the digest page, the JSON route
// and the status board. Types only; the reader lives next to it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, as logged. Only lines that parse to this shape count as runs.
export type RunLine = {
  at: string; // ISO 8601 with offset, e.g. 2026-10-28T23:00:02+01:00
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times are the `at` strings exactly as logged: offset kept, never UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; views render null as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  fails: number; // lines with status `fail`; > 0 marks the row
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` logged for the job, null when none
  firstAt: string;
  lastAt: string;
};

// Line counts for the whole night, for the status board.
export type NightCounts = { ok: number; retry: number; fail: number };

// One night read from disk. An empty file is a night with no rows ("nothing ran").
export type Night = {
  night: string; // YYYY-MM-DD, the file's name
  rows: DigestRow[]; // sorted by job, so the page and the JSON share one order
  counts: NightCounts;
  badLines: number; // lines that did not parse: counted, never thrown (blank lines are skipped)
};

// Reads <runsDir>/<night>.jsonl synchronously, like status.ts. Returns null when there is no
// file for that night (the page answers 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
