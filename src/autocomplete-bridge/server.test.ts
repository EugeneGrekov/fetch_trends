import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { upsertAuthUser } from './auth.js';
import { startAutocompleteBridgeServer, stopAutocompleteBridgeServer } from './server.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});
describe('autocomplete bridge HTTP API', () => {
  it('authenticates, submits, long-polls, and returns the first cached result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-bridge-server-'));
    tempDirs.push(dir);
    const authConfigPath = join(dir, 'users.json');
    await upsertAuthUser(authConfigPath, 'egrekov', 'correct horse battery staple');
    const started = await startAutocompleteBridgeServer({
      authConfigPath,
      dbPath: join(dir, 'bridge.sqlite'),
      host: '127.0.0.1',
      port: 0,
      resultsDir: join(dir, 'results'),
      researchRunner: async (job) => ({
        markdown: `# Result for ${job.seeds.join(', ')}\n`,
        outputPath: job.outputPath ?? join(dir, 'result.csv'),
      }),
    });

    try {
      const unauthorized = await fetch(`${started.url}/api/jobs`);
      expect(unauthorized.status).toBe(401);

      const loginResponse = await fetch(`${started.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'egrekov', password: 'correct horse battery staple' }),
      });
      expect(loginResponse.status).toBe(200);
      const login = await loginResponse.json() as { token: string };
      const headers = {
        authorization: `Bearer ${login.token}`,
        'content-type': 'application/json',
      };

      const createdResponse = await fetch(`${started.url}/api/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'autocomplete_check',
          seeds: ['AI app builder', 'business research'],
          modifiers: ['with', 'for'],
        }),
      });
      expect(createdResponse.status).toBe(201);
      const created = await createdResponse.json() as { job: { id: number } };

      const waitResponse = await fetch(`${started.url}/api/jobs/${created.job.id}/wait?timeout=1`, { headers });
      expect(waitResponse.status).toBe(200);
      let waited = await waitResponse.json() as { job: { id: number; status: string; resultMarkdown: string | null } };
      while (waited.job.status !== 'completed') {
        waited = await (await fetch(`${started.url}/api/jobs/${created.job.id}/wait?timeout=1`, { headers })).json() as typeof waited;
      }
      expect(waited.job.resultMarkdown).toContain('# Result for AI app builder, business research');

      const cachedResponse = await fetch(`${started.url}/api/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'autocomplete_check',
          seeds: [' BUSINESS RESEARCH ', 'ai APP BUILDER'],
          modifiers: ['FOR', 'WITH'],
        }),
      });
      expect(cachedResponse.status).toBe(200);
      const cached = await cachedResponse.json() as { cached: boolean; job: { id: number } };
      expect(cached).toMatchObject({ cached: true, job: { id: created.job.id } });
    } finally {
      await started.service.waitUntilIdle();
      await stopAutocompleteBridgeServer(started.server);
    }
  });
});
