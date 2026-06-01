import { Command } from 'commander';
import { getClient, transferOwnership, disconnectClient } from '../client.js';
import { auditLog } from '../audit.js';
import { assertWriteEnabled } from '../guard.js';
import { prompt, promptHidden } from '../prompt.js';
import ora from 'ora';
import chalk from 'chalk';

export const transferOwnerCommand = new Command('transfer-owner')
  .description('Transfer group/channel ownership to another member (irreversible)')
  .argument('<group>', 'Group name or @username')
  .argument('<user>', 'New owner username (e.g., @username)')
  .option('-y, --yes', 'Skip the typed confirmation prompt')
  .action(async (group, user, options) => {
    assertWriteEnabled();

    console.log(chalk.yellow(`\nYou are about to transfer ownership of "${group}" to ${user}.`));
    console.log(chalk.gray('You will lose your creator role. Only the new owner can transfer it back.\n'));

    if (!options.yes) {
      const confirm = await prompt(`Type the group name "${group}" to confirm: `);
      if (confirm.toLowerCase() !== group.toLowerCase()) {
        console.log(chalk.red('Confirmation did not match. Aborted.'));
        process.exit(1);
      }
    }

    const password = await promptHidden('Enter your Telegram 2FA password: ');
    if (!password) {
      console.error(chalk.red('A 2FA password is required to transfer ownership.'));
      process.exit(1);
    }

    const spinner = ora(`Transferring ownership of "${group}" to ${user}...`).start();

    try {
      const client = await getClient();
      const result = await transferOwnership(client, group, user, password);
      auditLog({ timestamp: new Date().toISOString(), command: 'transfer-owner', target: group, targetUser: user, result: { success: result.success, error: result.success ? undefined : result.message } });

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      auditLog({ timestamp: new Date().toISOString(), command: 'transfer-owner', target: group, targetUser: user, result: { success: false, error: error instanceof Error ? error.message : String(error) } });
      spinner.fail('Failed to transfer ownership');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
