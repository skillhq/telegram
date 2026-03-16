import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import JSON5 from 'json5';
import {
  SECRET_KEYS,
  isSecretKey,
  isSecretStoreAvailable,
  migrateSecretsToStore,
  secretDelete,
  secretGet,
  secretSet,
} from './secrets.js';

export interface TgConfig {
  apiId?: number;
  apiHash?: string;
  sessionString?: string;
  defaultFormat?: 'plain' | 'json' | 'markdown';
  opVault?: string;
}

const DEFAULT_CONFIG: TgConfig = {
  defaultFormat: 'plain',
};

// Cache loaded config to avoid repeated file I/O
let cachedConfig: TgConfig | null = null;
let cachedConfigTime: number = 0;
const CONFIG_CACHE_TTL_MS = 1000; // 1 second cache

function getGlobalConfigPath(): string {
  return join(homedir(), '.config', 'tg', 'config.json5');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfigFile(path: string, warn: (message: string) => void): Partial<TgConfig> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON5.parse(raw);

    // Validate that parsed result is a plain object
    if (!isPlainObject(parsed)) {
      warn(`Config at ${path} must be an object, got ${typeof parsed}`);
      return {};
    }

    return parsed as Partial<TgConfig>;
  } catch (error) {
    warn(`Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

export function loadConfig(warn: (message: string) => void = console.warn): TgConfig {
  // Return cached config if still valid
  const now = Date.now();
  if (cachedConfig && (now - cachedConfigTime) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const globalPath = getGlobalConfigPath();
  const fileConfig = readConfigFile(globalPath, warn);

  // Migrate secrets from file → secret store on first load (one-time per process)
  if (isSecretStoreAvailable()) {
    const cleaned = migrateSecretsToStore(fileConfig as Record<string, unknown>);
    if (cleaned !== fileConfig) {
      // Secrets were migrated — rewrite the file without them
      try {
        const content = JSON5.stringify(cleaned, null, 2);
        writeFileSync(globalPath, content, { encoding: 'utf8', mode: 0o600 });
      } catch {
        // Non-fatal: secrets are already in keychain, file cleanup can retry next time
      }
    }
  }

  // Build config: file values + secret store overlay for secrets
  const config: TgConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  };

  // Overlay secret store values (takes precedence over file values)
  if (isSecretStoreAvailable()) {
    for (const key of SECRET_KEYS) {
      const val = secretGet(key);
      if (val) (config as Record<string, unknown>)[key] = val;
    }
  }

  cachedConfig = config;
  cachedConfigTime = now;

  return cachedConfig;
}

export function saveConfig(config: Partial<TgConfig>): void {
  const path = getGlobalConfigPath();
  const dir = dirname(path);

  // Create directory with restrictive permissions (owner only)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Route secrets to secret store when available
  const fileData: Partial<TgConfig> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isSecretKey(key) && isSecretStoreAvailable() && typeof value === 'string') {
      if (!secretSet(key, value)) {
        // Secret store write failed — fall back to file storage
        (fileData as Record<string, unknown>)[key] = value;
      }
    } else {
      (fileData as Record<string, unknown>)[key] = value;
    }
  }

  // Load existing config and merge, with proper error handling
  let existing: Partial<TgConfig> = {};
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON5.parse(raw);
      if (isPlainObject(parsed)) {
        existing = parsed as Partial<TgConfig>;
      }
    } catch (error) {
      // Log but don't fail - we'll overwrite with new config
      console.warn(`Warning: Could not read existing config, will be overwritten: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Strip secrets from existing file data if secret store is available
  if (isSecretStoreAvailable()) {
    for (const key of Object.keys(existing)) {
      if (isSecretKey(key)) {
        delete (existing as Record<string, unknown>)[key];
      }
    }
  }

  const merged = { ...existing, ...fileData };
  const content = JSON5.stringify(merged, null, 2);

  // Write with restrictive permissions (owner read/write only)
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });

  // Invalidate cache
  cachedConfig = null;
}

export function getConfigPath(): string {
  return getGlobalConfigPath();
}

export function isConfigured(): boolean {
  const config = loadConfig(() => {});
  return (config.apiId ?? 0) > 0 && (config.apiHash ?? '') !== '';
}

export function setCredentials(apiId: number, apiHash: string): void {
  saveConfig({ apiId, apiHash });
}

export function getCredentials(): { apiId: number; apiHash: string } {
  const config = loadConfig(() => {});
  return {
    apiId: config.apiId ?? 0,
    apiHash: config.apiHash ?? '',
  };
}

export function setSessionString(session: string): void {
  saveConfig({ sessionString: session });
}

export function getSessionString(): string | undefined {
  const config = loadConfig(() => {});
  return config.sessionString;
}

export function clearSessionString(): void {
  // Delete from secret store
  secretDelete('sessionString');

  // Delete from file
  const path = getGlobalConfigPath();
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON5.parse(raw);
      if (isPlainObject(parsed)) {
        delete parsed.sessionString;
        writeFileSync(path, JSON5.stringify(parsed, null, 2), { encoding: 'utf8', mode: 0o600 });
      }
    } catch {
      // If we can't parse, nothing to clear
    }
  }

  // Invalidate cache
  cachedConfig = null;
}
