import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

const T = '2026-10-28T23:00:0';
const good = [
  line(`${T}1+01:00`, 'zeta-sync', 'ok', 'ana'),
  line(`${T}2+01:00`, 'alpha-backup', 'retry', null, 'timeout'),
  line(`${T}3+01:00`, 'alpha-backup', 'retry', null),
  line(`${T}4+01:00`, 'alpha-backup', 'retry', null),
  line(`${T}5+01:00`, 'mid-report', 'fail', 'bo', 'boom'),
  line(`${T}6+01:00`, 'quiet-job', 'ok', 'cy'),
];

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-10-28.jsonl'), good.join('\n') + '\n');
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');
  writeFileSync(join(dir, '2026-10-26.jsonl'), [good[0], 'not json {', good[5]].join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const rowFor = (html: string, job: string) => html.match(new RegExp(`<tr[^>]*>(?:(?!</tr>).)*${job}.*?</tr>`, 's'))?.[0] ?? '';
const warnRows = (html: string) =>
  [...html.matchAll(/<tr class="warn">.*?<td>(.*?)<\/td>/gs)].map((m) => m[1]);

const jobs = ['alpha-backup', 'mid-report', 'quiet-job', 'zeta-sync'];

describe('GET /digest/:night', () => {
  it('renders the lane banner and rows sorted by job', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const at = jobs.map((j) => html.indexOf(j));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('marks retries >= 3 and fails with warn, and only those', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(warnRows(html)).toEqual(['alpha-backup', 'mid-report']);
  });

  it('shows — for a null owner and a null last error', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    // alpha-backup: null owner, but lastError keeps the earlier 'timeout'
    const alpha = rowFor(html, 'alpha-backup');
    expect(alpha).toContain('<td>—</td>');
    expect(alpha).toContain('timeout');
    // quiet-job: owner cy, never logged an error
    const quiet = rowFor(html, 'quiet-job');
    expect(quiet).toContain('<td>cy</td>');
    expect(quiet).toContain('<td>—</td>');
  });

  it('marks no row on a clean night', async () => {
    writeFileSync(join(dir, '2026-10-25.jsonl'), line(`${T}1+01:00`, 'calm', 'ok', 'ana') + '\n');
    const html = await (await app.request('/digest/2026-10-25')).text();
    expect(html).toContain('calm');
    expect(html).not.toContain('class="warn"');
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/digest/2020-01-01')).status).toBe(404);
  });

  it('says nothing ran for an empty file', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    const res = await app.request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('zeta-sync');
    expect(html).toContain('quiet-job');
    expect(html).toContain('1 line did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night as JSON', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual(jobs);
    expect(night.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
    expect(night.badLines).toBe(0);
    const alpha = night.rows[0]!;
    expect(alpha.retries).toBe(3);
    expect(alpha.owner).toBeNull();
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/api/digest/2020-01-01')).status).toBe(404);
  });

  it('returns no rows for an empty file', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Night).rows).toEqual([]);
  });

  it('counts a bad line and keeps the valid rows', async () => {
    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['quiet-job', 'zeta-sync']);
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const night = (await (await app.request('/api/digest/2026-10-28')).json()) as Night;
    const names = night.rows.map((r) => r.job);
    const order = [...names].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(order).toEqual(names);
    expect(names.every((n) => html.includes(n))).toBe(true);
  });
});
