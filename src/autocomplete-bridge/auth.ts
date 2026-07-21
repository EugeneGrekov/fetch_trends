import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_AUTH_CONFIG_PATH = './config/autocomplete-users.json';

export interface AuthUserRecord {
  username: string;
  passwordSalt: string;
  passwordHash: string;
  tokenHash?: string;
}
export interface AuthConfig {
  users: AuthUserRecord[];
}

export class InvalidCredentialsError extends Error {}

export function resolveAuthConfigPath(explicitPath?: string): string {
  return resolve(process.cwd(), explicitPath ?? process.env.FETCH_TRENDS_AUTH_CONFIG ?? DEFAULT_AUTH_CONFIG_PATH);
}

export async function upsertAuthUser(
  configPath: string,
  usernameValue: string,
  password: string,
): Promise<AuthUserRecord> {
  const username = normalizeUsername(usernameValue);
  validatePassword(password);
  const config = await loadAuthConfig(configPath, true);
  const passwordSalt = randomBytes(16).toString('base64');
  const passwordHash = (await derivePasswordHash(password, passwordSalt)).toString('base64');
  const nextUser: AuthUserRecord = { username, passwordSalt, passwordHash };
  const existingIndex = config.users.findIndex((user) => user.username === username);

  if (existingIndex >= 0) {
    config.users[existingIndex] = nextUser;
  } else {
    config.users.push(nextUser);
    config.users.sort((left, right) => left.username.localeCompare(right.username));
  }

  await saveAuthConfig(configPath, config);
  return nextUser;
}

export async function loginWithPassword(
  configPath: string,
  usernameValue: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const username = normalizeUsername(usernameValue);
  const config = await loadAuthConfig(configPath);
  const user = config.users.find((candidate) => candidate.username === username);

  if (!user || !(await verifyPassword(password, user))) {
    throw new InvalidCredentialsError('Invalid username or password.');
  }

  const token = randomBytes(32).toString('base64url');
  user.tokenHash = hashToken(token);
  await saveAuthConfig(configPath, config);

  return { token, username: user.username };
}

export async function authenticateToken(
  configPath: string,
  token: string,
): Promise<{ username: string } | undefined> {
  if (!token) {
    return undefined;
  }

  const incomingHash = hashToken(token);
  const config = await loadAuthConfig(configPath);

  for (const user of config.users) {
    if (user.tokenHash && safeEqualHex(user.tokenHash, incomingHash)) {
      return { username: user.username };
    }
  }

  return undefined;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function loadAuthConfig(configPath: string, allowMissing = false): Promise<AuthConfig> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return validateAuthConfig(parsed);
  } catch (error) {
    if (allowMissing && isNodeError(error) && error.code === 'ENOENT') {
      return { users: [] };
    }

    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`Authentication config was not found at ${configPath}. Create a user first.`);
    }

    throw error;
  }
}

async function verifyPassword(password: string, user: AuthUserRecord): Promise<boolean> {
  const expected = Buffer.from(user.passwordHash, 'base64');
  const actual = await derivePasswordHash(password, user.passwordSalt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function derivePasswordHash(password: string, saltBase64: string): Promise<Buffer> {
  const salt = Buffer.from(saltBase64, 'base64');

  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise(derivedKey);
    });
  });
}

async function saveAuthConfig(configPath: string, config: AuthConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, configPath);
}

function validateAuthConfig(value: unknown): AuthConfig {
  if (!isRecord(value) || !Array.isArray(value.users)) {
    throw new Error('Authentication config must contain a users array.');
  }

  const users = value.users.map((candidate) => {
    if (
      !isRecord(candidate)
      || typeof candidate.username !== 'string'
      || typeof candidate.passwordSalt !== 'string'
      || typeof candidate.passwordHash !== 'string'
      || (candidate.tokenHash !== undefined && typeof candidate.tokenHash !== 'string')
    ) {
      throw new Error('Authentication config contains an invalid user record.');
    }

    return {
      username: normalizeUsername(candidate.username),
      passwordSalt: candidate.passwordSalt,
      passwordHash: candidate.passwordHash,
      tokenHash: candidate.tokenHash,
    } satisfies AuthUserRecord;
  });

  if (new Set(users.map((user) => user.username)).size !== users.length) {
    throw new Error('Authentication config contains duplicate usernames.');
  }

  return { users };
}

function normalizeUsername(value: string): string {
  const username = value.trim();
  if (!username || username.length > 100) {
    throw new Error('Username must contain between 1 and 100 characters.');
  }

  return username;
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('Password must contain at least 8 characters.');
  }
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
