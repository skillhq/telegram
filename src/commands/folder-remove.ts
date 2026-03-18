import { Command } from 'commander';
import { getClient, removeChatFromFolder, disconnectClient } from '../client.js';
import { assertWriteEnabled } from '../guard.js';
import ora from 'ora';

export const folderRemoveCommand = new Command('folder-remove')
  .description('Remove a chat from a folder')
  .argument('<folder>', 'Folder name')
  .argument('<chat>', 'Chat name, username, or ID')
  .action(async (folder, chat) => {
    assertWriteEnabled();
    const spinner = ora(`Removing "${chat}" from folder "${folder}"...`).start();

    try {
      const client = await getClient();
      const result = await removeChatFromFolder(client, folder, chat);

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      spinner.fail('Failed to remove chat from folder');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
