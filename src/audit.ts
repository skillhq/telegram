import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  command: string;
  target: string;
  message?: string;
  replyToMsgId?: number;
  kickedUser?: string;
  result: {
    success: boolean;
    messageId?: number;
    error?: string;
  };
}

const AUDIT_PATH = join(homedir(), '.config', 'tg', 'audit.jsonl');

export function auditLog(entry: AuditEntry): void {
  try {
    const dir = join(homedir(), '.config', 'tg');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Never throw — audit failures must not break the caller
  }
}
