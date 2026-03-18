import { Command } from 'commander';
import { getClient, unmuteChat, disconnectClient } from '../client.js';
import { assertWriteEnabled } from '../guard.js';
import ora from 'ora';

export const unmuteCommand = new Command('unmute')
  .description('Unmute a chat')
  .argument('<chat>', 'Chat name, username, or ID')
  .action(async (chat) => {
    assertWriteEnabled();
    const spinner = ora(`Unmuting "${chat}"...`).start();

    try {
      const client = await getClient();
      const result = await unmuteChat(client, chat);

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      spinner.fail('Failed to unmute chat');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
