import { Command } from 'commander';
import { getClient, muteChat, disconnectClient } from '../client.js';
import { assertWriteEnabled } from '../guard.js';
import ora from 'ora';

export const muteCommand = new Command('mute')
  .description('Mute a chat')
  .argument('<chat>', 'Chat name, username, or ID')
  .option('-d, --duration <duration>', 'Duration (1h, 8h, 1d, 1w, or forever)', 'forever')
  .action(async (chat, options) => {
    assertWriteEnabled();
    const spinner = ora(`Muting "${chat}"...`).start();

    try {
      const client = await getClient();
      const result = await muteChat(client, chat, options.duration);

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      spinner.fail('Failed to mute chat');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
