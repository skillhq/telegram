import { Command } from 'commander';
import { Api } from 'telegram';
import { getClient, getMessages, disconnectClient } from '../client.js';
import { formatJson } from '../formatters/json.js';
import { formatMessages } from '../formatters/plain.js';
import { formatMessagesMarkdown } from '../formatters/markdown.js';
import { getOutputFormat } from '../formatters/index.js';
import ora from 'ora';

function parseTimeOffset(offset: string): Date {
  const now = new Date();
  const match = offset.match(/^(\d+)([mhd])$/);

  if (!match) {
    throw new Error(`Invalid time offset: ${offset}. Use format like "1h", "30m", "7d"`);
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return new Date(now.getTime() - value * 60 * 1000);
    case 'h':
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function readAllChats(options: { limit: number; minDate?: Date; maxDate?: Date; format: string }) {
  const client = await getClient();
  const dialogs = await client.getDialogs({ limit: 500 });
  const allResults: { chatTitle: string; messages: any[] }[] = [];
  let fetched = 0;

  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity) continue;

    if (options.minDate && dialog.message?.date) {
      const lastDate = new Date(dialog.message.date * 1000);
      if (lastDate < options.minDate) continue;
    }

    const title = dialog.title || 'Unknown';
    const chatId = entity.id.toString();

    try {
      const msgs = await client.getMessages(entity, { limit: options.limit });
      fetched++;
      const filtered = [];
      for (const msg of msgs) {
        if (!(msg instanceof Api.Message)) continue;
        const msgDate = new Date(msg.date * 1000);
        if (options.minDate && msgDate < options.minDate) break;
        if (options.maxDate && msgDate > options.maxDate) continue;

        let sender = 'Unknown';
        let senderId: string | undefined;
        try {
          if (msg.fromId) {
            const e = await client.getEntity(msg.fromId);
            if (e instanceof Api.User) {
              sender = e.firstName || e.username || 'Unknown';
              senderId = e.id.toString();
            } else if (e instanceof Api.Channel || e instanceof Api.Chat) {
              sender = (e as Api.Channel | Api.Chat).title || 'Unknown';
              senderId = e.id.toString();
            }
          }
        } catch { /* ignore */ }

        filtered.push({
          id: msg.id,
          date: msgDate,
          chatId,
          chatTitle: title,
          sender,
          senderId,
          text: msg.message || '',
          replyToMsgId: msg.replyTo?.replyToMsgId ?? null,
          isOutgoing: msg.out ?? false,
        });
      }

      if (filtered.length > 0) {
        allResults.push({ chatTitle: title, messages: filtered });
      }

      if (fetched % 5 === 0) await sleep(1000);
    } catch (err: any) {
      if (err?.seconds) {
        process.stderr.write(`Rate limited, waiting ${err.seconds}s…\n`);
        await sleep(err.seconds * 1000);
      }
    }
  }

  return allResults;
}

export const readCommand = new Command('read')
  .description('Read messages from a chat (or all chats with --since)')
  .argument('[chat]', 'Chat name, username (@user), or ID')
  .option('-n, --limit <number>', 'Number of messages to fetch', '50')
  .option('--since <time>', 'Get messages since (e.g., "1h", "30m", "7d")')
  .option('--until <time>', 'Get messages until (e.g., "1h", "30m", "7d")')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .action(async (chat, options) => {
    if (!chat && !options.since) {
      console.error('Provide a chat name, or use --since to read across all chats.');
      process.exit(1);
    }

    const format = getOutputFormat(options);

    if (!chat) {
      const spinner = ora('Fetching messages from all active chats...').start();
      try {
        const minDate = options.since ? parseTimeOffset(options.since) : undefined;
        const maxDate = options.until ? parseTimeOffset(options.until) : undefined;
        const results = await readAllChats({
          limit: parseInt(options.limit),
          minDate,
          maxDate,
          format,
        });

        spinner.stop();

        if (format === 'json') {
          for (const { messages } of results) {
            for (const msg of messages) {
              process.stdout.write(JSON.stringify(msg) + '\n');
            }
          }
        } else {
          for (const { chatTitle, messages } of results) {
            if (format === 'markdown') {
              console.log(formatMessagesMarkdown(messages, chatTitle));
            } else {
              console.log(formatMessages(messages, chatTitle));
            }
          }
        }

        await disconnectClient();
      } catch (error) {
        spinner.fail('Failed to fetch messages');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
      return;
    }

    const spinner = ora(`Fetching messages from "${chat}"...`).start();

    try {
      const client = await getClient();

      const fetchOptions: Parameters<typeof getMessages>[2] = {
        limit: parseInt(options.limit),
      };

      if (options.since) {
        fetchOptions.minDate = parseTimeOffset(options.since);
      }

      if (options.until) {
        fetchOptions.maxDate = parseTimeOffset(options.until);
      }

      const { messages, chatTitle } = await getMessages(client, chat, fetchOptions);

      spinner.stop();

      switch (format) {
        case 'json':
          for (const msg of messages) {
            process.stdout.write(JSON.stringify({ ...msg, chatTitle }) + '\n');
          }
          break;
        case 'markdown':
          console.log(formatMessagesMarkdown(messages, chatTitle));
          break;
        default:
          console.log(formatMessages(messages, chatTitle));
      }

      await disconnectClient();
    } catch (error) {
      spinner.fail('Failed to fetch messages');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
