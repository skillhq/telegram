import {
  SECRET_KEYS,
  isKeychainAvailable,
  isSecretKey,
  keychainDelete,
  keychainGet,
  keychainSet,
} from './keychain.js';
import {
  isOnePasswordAvailable,
  opDelete,
  opGet,
  opSet,
} from './onepassword.js';

export { SECRET_KEYS, isSecretKey };

type Provider = 'op' | 'keychain' | 'none';

function activeProvider(): Provider {
  if (isOnePasswordAvailable()) return 'op';
  if (isKeychainAvailable()) return 'keychain';
  return 'none';
}

export function isSecretStoreAvailable(): boolean {
  return activeProvider() !== 'none';
}

export function secretGet(key: string): string | null {
  const provider = activeProvider();
  if (provider === 'op') return opGet(key);
  if (provider === 'keychain') return keychainGet(key);
  return null;
}

export function secretSet(key: string, value: string): boolean {
  const provider = activeProvider();
  if (provider === 'op') return opSet(key, value);
  if (provider === 'keychain') return keychainSet(key, value);
  return false;
}

export function secretDelete(key: string): boolean {
  const provider = activeProvider();
  if (provider === 'op') return opDelete(key);
  if (provider === 'keychain') return keychainDelete(key);
  return false;
}

let migrationDone = false;

/**
 * Migrate secret fields from a config object into the active secret store.
 * Returns a new config object with successfully migrated secrets removed.
 */
export function migrateSecretsToStore(config: Record<string, unknown>): Record<string, unknown> {
  if (migrationDone || !isSecretStoreAvailable()) return config;
  migrationDone = true;

  let needsRewrite = false;
  const cleaned = { ...config };

  for (const key of SECRET_KEYS) {
    const value = config[key];
    if (typeof value === 'string' && value !== '') {
      if (secretSet(key, value)) {
        delete cleaned[key];
        needsRewrite = true;
      }
    }
  }

  if (!needsRewrite) return config;
  return cleaned;
}
