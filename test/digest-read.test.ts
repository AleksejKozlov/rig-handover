import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has the 5 jobs in job order and 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps the row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('folds fixtures/refresh into one row with its last error', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('marks the notes/backup fail', () => {
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps the offsets as logged', () => {
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(row('lane/sync')).toMatchObject({
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a malformed night string', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(dir, '../x')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts invalid run lines and skips blank ones', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
      '',
      '{"job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-01-03T02:00:00+02:00","status":"ok","owner":"rook"}',
      '{"at":"2026-01-03T03:00:00+02:00","job":"a","status":"done","owner":"rook"}',
      'not json',
      '   ',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(4);
    expect(night?.rows).toHaveLength(1);
  });
});
