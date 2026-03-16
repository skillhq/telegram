import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let opAvailableCache: boolean | null = null;
let opBinaryPath: string | null = null;
let resolvedVault: string | null = null;

function getOpBinary(): string | null {
  if (opBinaryPath !== null) return opBinaryPath;
  try {
    opBinaryPath = execSync('which op', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    opBinaryPath = '';
  }
  return opBinaryPath || null;
}

function resolveVault(): string | null {
  if (resolvedVault !== null) return resolvedVault;

  // Env var takes precedence
  const envVault = process.env.TG_OP_VAULT;
  if (envVault) {
    resolvedVault = envVault;
    return resolvedVault;
  }

  // Fall back to config file (read directly to avoid circular dep with config.ts)
  try {
    const configPath = join(homedir(), '.config', 'tg', 'config.json5');
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8');
      // Use dynamic import to avoid bundling JSON5 parse at module level
      // Simple extraction: look for opVault field
      const match = raw.match(/["']?opVault["']?\s*:\s*["']([^"']+)["']/);
      if (match) {
        resolvedVault = match[1];
        return resolvedVault;
      }
    }
  } catch {
    // Config unreadable — no vault
  }

  resolvedVault = '';
  return null;
}

function getToken(): string | undefined {
  return process.env.OP_SERVICE_ACCOUNT_TOKEN;
}

function itemName(key: string): string {
  return `tg-cli-${key}`;
}

export function isOnePasswordAvailable(): boolean {
  if (opAvailableCache !== null) return opAvailableCache;

  const token = getToken();
  if (!token || !token.startsWith('ops_')) {
    opAvailableCache = false;
    return false;
  }

  const binary = getOpBinary();
  if (!binary) {
    opAvailableCache = false;
    return false;
  }

  const vault = resolveVault();
  if (!vault) {
    opAvailableCache = false;
    return false;
  }

  try {
    execFileSync(binary, ['whoami'], {
      encoding: 'utf8',
      stdio: 'ignore',
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    opAvailableCache = true;
  } catch {
    opAvailableCache = false;
  }

  return opAvailableCache;
}

export function opGet(key: string): string | null {
  if (!isOnePasswordAvailable()) return null;
  const binary = getOpBinary()!;
  const vault = resolveVault()!;
  const token = getToken()!;

  try {
    const result = execFileSync(binary, [
      'read', `op://${vault}/${itemName(key)}/credential`,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

export function opSet(key: string, value: string): boolean {
  if (!isOnePasswordAvailable()) return false;
  const binary = getOpBinary()!;
  const vault = resolveVault()!;
  const token = getToken()!;
  const name = itemName(key);
  const env = { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token };

  try {
    // Check if item exists
    let exists = false;
    try {
      execFileSync(binary, ['item', 'get', name, '--vault', vault], {
        stdio: 'ignore',
        env,
      });
      exists = true;
    } catch {
      // Item doesn't exist
    }

    if (exists) {
      execFileSync(binary, [
        'item', 'edit', name,
        '--vault', vault,
        `credential=${value}`,
      ], { stdio: 'ignore', env });
    } else {
      execFileSync(binary, [
        'item', 'create',
        '--category', 'API Credential',
        '--vault', vault,
        '--title', name,
        `credential=${value}`,
      ], { stdio: 'ignore', env });
    }

    return true;
  } catch {
    return false;
  }
}

export function opDelete(key: string): boolean {
  if (!isOnePasswordAvailable()) return false;
  const binary = getOpBinary()!;
  const vault = resolveVault()!;
  const token = getToken()!;

  try {
    execFileSync(binary, [
      'item', 'delete', itemName(key), '--vault', vault,
    ], {
      stdio: 'ignore',
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    return true;
  } catch {
    return false;
  }
}
