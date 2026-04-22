import { Command } from 'commander';
import { getClient, getDialogs, getMessages, disconnectClient, parseTimeOffset, formatMediaLabel } from '../client.js';
import type { MessageInfo } from '../client.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface SyncMeta {
  [chatTitle: string]: {
    lastMessageId: number;
    lastSyncDate: string;
  };
}

function readSyncMeta(outputDir: string): SyncMeta {
  const metaPath = join(outputDir, '.sync-meta.json');
  if (existsSync(metaPath)) {
    try {
      return JSON.parse(readFileSync(metaPath, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function writeSyncMeta(outputDir: string, meta: SyncMeta): void {
  const metaPath = join(outputDir, '.sync-meta.json');
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

function formatMessageLine(msg: MessageInfo): string {
  const time = msg.date.toISOString().replace('T', ' ').substring(0, 19);
  const sender = msg.isOutgoing ? 'You' : msg.sender;
  const reply = msg.replyToMsgId ? ` (reply to #${msg.replyToMsgId})` : '';
  const media = formatMediaLabel(msg.mediaType, msg.fileName, msg.fileSize);
  const text = msg.text || (media ? '' : '(no text)');
  const display = media ? (text ? `[${media}] ${text}` : `[${media}]`) : text;

  return `**${sender}** - ${time}${reply}\n> ${display}\n*#${msg.id}*\n`;
}

export const syncCommand = new Command('sync')
  .description('Sync messages to markdown files')
  .option('--days <number>', 'Number of days to sync', '7')
  .option('--since <time>', 'Start from time offset (e.g., "1h", "30m", "7d")')
  .option('--until <time>', 'End at time offset (e.g., "1h", "30m", "7d")')
  .option('--all', 'Sync entire chat history (no time limit)')
  .option('--chat <name>', 'Sync specific chat only')
  .option('--output <dir>', 'Output directory', './telegram-sync')
  .option('--resume', 'Incremental sync: only fetch messages since last sync')
  .action(async (options) => {
    const spinner = ora('Starting sync...').start();

    try {
      const client = await getClient();
      const outputDir = options.output;

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Determine date range
      let minDate: Date | undefined;
      let maxDate: Date | undefined;

      if (options.all) {
        // No date filtering
      } else if (options.since) {
        minDate = parseTimeOffset(options.since);
      } else {
        minDate = new Date();
        minDate.setDate(minDate.getDate() - parseInt(options.days));
      }

      if (options.until) {
        maxDate = parseTimeOffset(options.until);
      }

      // Read sync metadata for incremental sync
      const meta = options.resume ? readSyncMeta(outputDir) : {};

      let chats;
      if (options.chat) {
        const allChats = await getDialogs(client, 500);
        chats = allChats.filter(c =>
          c.title.toLowerCase().includes(options.chat.toLowerCase())
        );

        if (chats.length === 0) {
          spinner.fail(`No chat found matching "${options.chat}"`);
          await disconnectClient();
          return;
        }
      } else {
        chats = await getDialogs(client, 100);
      }

      spinner.text = `Syncing ${chats.length} chats...`;

      let synced = 0;
      for (const chat of chats) {
        try {
          spinner.text = `Syncing "${chat.title}"...`;

          // For incremental sync, use last known message ID
          const lastMeta = options.resume ? meta[chat.title] : undefined;
          const minId = lastMeta?.lastMessageId;

          const fetchOptions: Parameters<typeof getMessages>[2] = {
            limit: options.all ? Number.MAX_SAFE_INTEGER : 1000,
            minDate,
            maxDate,
          };

          if (minId) {
            fetchOptions.minId = minId;
          }

          const { messages } = await getMessages(client, chat.title, fetchOptions);

          if (messages.length === 0) {
            continue;
          }

          // Sort messages chronologically
          messages.sort((a, b) => a.date.getTime() - b.date.getTime());

          const safeTitle = chat.title.replace(/[/\\?%*:|"<>]/g, '-');
          const filename = `${safeTitle}.md`;
          const filePath = join(outputDir, filename);

          let content: string;

          if (options.resume && minId && existsSync(filePath)) {
            // Append new messages to existing file
            const existing = readFileSync(filePath, 'utf-8');
            const newLines = messages.map(formatMessageLine).join('\n');
            content = existing.trimEnd() + '\n\n' + newLines;
          } else {
            // Write fresh file
            const lines: string[] = [];
            lines.push(`# ${chat.title}`);
            lines.push(`\nType: ${chat.type}`);
            if (chat.username) {
              lines.push(`Username: @${chat.username}`);
            }
            lines.push(`\nSynced: ${new Date().toISOString()}`);
            lines.push(`Messages: ${messages.length}`);
            lines.push('\n---\n');

            for (const msg of messages) {
              lines.push(formatMessageLine(msg));
            }

            content = lines.join('\n');
          }

          writeFileSync(filePath, content);

          // Update sync metadata
          const maxMsgId = Math.max(...messages.map(m => m.id));
          meta[chat.title] = {
            lastMessageId: maxMsgId,
            lastSyncDate: new Date().toISOString(),
          };

          synced++;
        } catch (error) {
          console.error(chalk.yellow(`\nWarning: Could not sync "${chat.title}": ${error instanceof Error ? error.message : error}`));
        }
      }

      // Always write metadata for future resume
      writeSyncMeta(outputDir, meta);

      spinner.succeed(chalk.green(`Synced ${synced} chats to ${outputDir}`));

      await disconnectClient();
    } catch (error) {
      spinner.fail('Sync failed');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
