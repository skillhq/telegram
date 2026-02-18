import { Command } from 'commander';
import { getClient, sendMessage, disconnectClient } from '../client.js';
import { formatJson } from '../formatters/json.js';
import { auditLog } from '../audit.js';
import chalk from 'chalk';
import ora from 'ora';

export const replyCommand = new Command('reply')
  .description('Reply to a message')
  .argument('<chat>', 'Chat name, username (@user), or ID')
  .argument('<msg-id>', 'Message ID to reply to')
  .argument('<message>', 'Reply text')
  .option('--json', 'Output as JSON')
  .action(async (chat, msgId, message, options) => {
    const spinner = ora('Sending reply...').start();

    try {
      const client = await getClient();
      const result = await sendMessage(client, chat, message, parseInt(msgId));
      auditLog({ timestamp: new Date().toISOString(), command: 'reply', target: chat, message, replyToMsgId: parseInt(msgId), result: { success: true, messageId: result.id } });

      spinner.succeed(chalk.green('Reply sent'));

      if (options.json) {
        console.log(formatJson({
          id: result.id,
          replyToMsgId: parseInt(msgId),
          date: result.date ? new Date(result.date * 1000).toISOString() : null,
          text: result.message,
        }));
      } else {
        console.log(chalk.gray(`Message ID: ${result.id}`));
      }

      await disconnectClient();
    } catch (error) {
      auditLog({ timestamp: new Date().toISOString(), command: 'reply', target: chat, message, replyToMsgId: parseInt(msgId), result: { success: false, error: error instanceof Error ? error.message : String(error) } });
      spinner.fail('Failed to send reply');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
