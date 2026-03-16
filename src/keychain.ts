import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

const SERVICE_NAME = 'tg-cli';
const SECURITY_PATH = '/usr/bin/security';
export const SECRET_KEYS = new Set(['apiHash', 'sessionString']);

let keychainAvailableCache: boolean | null = null;

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export function isKeychainAvailable(): boolean {
  if (keychainAvailableCache !== null) return keychainAvailableCache;

  if (platform() !== 'darwin') {
    keychainAvailableCache = false;
    return false;
  }

  try {
    // Verify the security binary exists and is executable
    execFileSync(SECURITY_PATH, ['help'], { stdio: 'ignore' });
    keychainAvailableCache = true;
  } catch {
    keychainAvailableCache = false;
  }

  return keychainAvailableCache;
}

export function keychainGet(key: string): string | null {
  if (!isKeychainAvailable()) return null;

  try {
    const result = execFileSync(SECURITY_PATH, [
      'find-generic-password',
      '-s', SERVICE_NAME,
      '-a', key,
      '-w',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

    return result.trimEnd();
  } catch {
    return null;
  }
}

export function keychainSet(key: string, value: string): boolean {
  if (!isKeychainAvailable()) return false;

  try {
    execFileSync(SECURITY_PATH, [
      'add-generic-password',
      '-s', SERVICE_NAME,
      '-a', key,
      '-w', value,
      '-U', // update if entry already exists
    ], { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

export function keychainDelete(key: string): boolean {
  if (!isKeychainAvailable()) return false;

  try {
    execFileSync(SECURITY_PATH, [
      'delete-generic-password',
      '-s', SERVICE_NAME,
      '-a', key,
    ], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let migrationDone = false;

/**
 * Migrate secret fields from a config object into the keychain.
 * Returns a new config object with successfully migrated secrets removed.
 */
export function migrateSecretsToKeychain(config: Record<string, unknown>): Record<string, unknown> {
  if (migrationDone || !isKeychainAvailable()) return config;
  migrationDone = true;

  let needsRewrite = false;
  const cleaned = { ...config };

  for (const key of SECRET_KEYS) {
    const value = config[key];
    if (typeof value === 'string' && value !== '') {
      if (keychainSet(key, value)) {
        delete cleaned[key];
        needsRewrite = true;
      }
      // If keychainSet fails, leave the secret in the file — retry next invocation
    }
  }

  if (!needsRewrite) return config;
  return cleaned;
}
