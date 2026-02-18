import { Command } from 'commander';
import { getClient, sendMessage, disconnectClient } from '../client.js';
import { formatJson } from '../formatters/json.js';
import { auditLog } from '../audit.js';
import chalk from 'chalk';
import ora from 'ora';

export const sendCommand = new Command('send')
  .description('Send a message')
  .argument('<target>', 'Chat name, username (@user), or ID')
  .argument('<message>', 'Message text')
  .option('--json', 'Output as JSON')
  .action(async (target, message, options) => {
    const spinner = ora(`Sending message to "${target}"...`).start();

    try {
      const client = await getClient();
      const result = await sendMessage(client, target, message);
      auditLog({ timestamp: new Date().toISOString(), command: 'send', target, message, result: { success: true, messageId: result.id } });

      spinner.succeed(chalk.green('Message sent'));

      if (options.json) {
        console.log(formatJson({
          id: result.id,
          date: result.date ? new Date(result.date * 1000).toISOString() : null,
          text: result.message,
        }));
      } else {
        console.log(chalk.gray(`Message ID: ${result.id}`));
      }

      await disconnectClient();
    } catch (error) {
      auditLog({ timestamp: new Date().toISOString(), command: 'send', target, message, result: { success: false, error: error instanceof Error ? error.message : String(error) } });
      spinner.fail('Failed to send message');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
