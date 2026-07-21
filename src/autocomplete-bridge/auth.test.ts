import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authenticateToken,
  hashToken,
  InvalidCredentialsError,
  loadAuthConfig,
  loginWithPassword,
  upsertAuthUser,
} from './auth.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('autocomplete bridge authentication', () => {
  it('stores a salted password hash, returns a token once, and stores only its hash', async () => {
    const configPath = await tempConfigPath();
    await upsertAuthUser(configPath, 'egrekov', 'correct horse battery staple');

    const beforeLoginText = await readFile(configPath, 'utf8');
    expect(beforeLoginText).not.toContain('correct horse battery staple');

    const login = await loginWithPassword(configPath, 'egrekov', 'correct horse battery staple');
    const config = await loadAuthConfig(configPath);

    expect(login.token).toHaveLength(43);
    expect(config.users[0]).toMatchObject({
      username: 'egrekov',
      tokenHash: hashToken(login.token),
    });
    expect(JSON.stringify(config)).not.toContain(login.token);
    await expect(authenticateToken(configPath, login.token)).resolves.toEqual({ username: 'egrekov' });
  });

  it('replaces the previous token on the next successful login', async () => {
    const configPath = await tempConfigPath();
    await upsertAuthUser(configPath, 'egrekov', 'correct horse battery staple');
    const first = await loginWithPassword(configPath, 'egrekov', 'correct horse battery staple');
    const second = await loginWithPassword(configPath, 'egrekov', 'correct horse battery staple');

    await expect(authenticateToken(configPath, first.token)).resolves.toBeUndefined();
    await expect(authenticateToken(configPath, second.token)).resolves.toEqual({ username: 'egrekov' });
  });

  it('rejects invalid credentials', async () => {
    const configPath = await tempConfigPath();
    await upsertAuthUser(configPath, 'egrekov', 'correct horse battery staple');

    await expect(loginWithPassword(configPath, 'egrekov', 'wrong password'))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

async function tempConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-bridge-auth-'));
  tempDirs.push(dir);
  return join(dir, 'users.json');
}
