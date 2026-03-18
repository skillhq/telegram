import { Command } from 'commander';
import { getClient, addChatToFolder, disconnectClient } from '../client.js';
import { assertWriteEnabled } from '../guard.js';
import ora from 'ora';

export const folderAddCommand = new Command('folder-add')
  .description('Add a chat to a folder')
  .argument('<folder>', 'Folder name')
  .argument('<chat>', 'Chat name, username, or ID')
  .action(async (folder, chat) => {
    assertWriteEnabled();
    const spinner = ora(`Adding "${chat}" to folder "${folder}"...`).start();

    try {
      const client = await getClient();
      const result = await addChatToFolder(client, folder, chat);

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      spinner.fail('Failed to add chat to folder');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
