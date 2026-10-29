import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with its counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    for (const night of ['2026-10-28', '2026-10-27']) {
      const li = html.match(new RegExp(`<li>\\s*<a href="/digest/${night}">.*?</li>`, 's'))?.[0];
      expect(li).toBeDefined();
      expect(li).toMatch(/ok \d+ · retry \d+ · fail \d+/);
    }
  });

  it('shows — for a night whose file cannot be read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    mkdirSync(join(dir, '2026-10-01.jsonl'));
    const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-01">2026-10-01</a>');
    expect(html).toContain('—');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
