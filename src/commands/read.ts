import { Command } from 'commander';
import { getClient, getMessages, disconnectClient, parseTimeOffset } from '../client.js';
import { formatJson } from '../formatters/json.js';
import { formatMessages } from '../formatters/plain.js';
import { formatMessagesMarkdown } from '../formatters/markdown.js';
import { getOutputFormat } from '../formatters/index.js';
import ora from 'ora';

export const readCommand = new Command('read')
  .description('Read messages from a chat')
  .argument('<chat>', 'Chat name, username (@user), or ID')
  .option('-n, --limit <number>', 'Number of messages to fetch', '50')
  .option('--since <time>', 'Get messages since (e.g., "1h", "30m", "7d")')
  .option('--until <time>', 'Get messages until (e.g., "1h", "30m", "7d")')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .action(async (chat, options) => {
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

      const format = getOutputFormat(options);

      switch (format) {
        case 'json':
          console.log(formatJson({ chatTitle, messages }));
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
