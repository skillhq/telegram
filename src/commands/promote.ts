import { Command } from 'commander';
import { getClient, promoteAdmin, disconnectClient } from '../client.js';
import { auditLog } from '../audit.js';
import { assertWriteEnabled } from '../guard.js';
import ora from 'ora';

export const promoteCommand = new Command('promote')
  .description('Promote a group member to admin')
  .argument('<group>', 'Group name or @username')
  .argument('<user>', 'Username to promote (e.g., @username)')
  .option('--rank <title>', 'Custom admin title/badge (supergroups only)')
  .option('--add-admins', 'Also allow the new admin to add other admins')
  .action(async (group, user, options) => {
    assertWriteEnabled();
    const spinner = ora(`Promoting ${user} in "${group}"...`).start();

    try {
      const client = await getClient();
      const result = await promoteAdmin(client, group, user, {
        rank: options.rank,
        canAddAdmins: options.addAdmins,
      });
      auditLog({ timestamp: new Date().toISOString(), command: 'promote', target: group, targetUser: user, result: { success: result.success, error: result.success ? undefined : result.message } });

      if (result.success) {
        spinner.succeed(result.message);
      } else {
        spinner.fail(result.message);
        process.exit(1);
      }

      await disconnectClient();
    } catch (error) {
      auditLog({ timestamp: new Date().toISOString(), command: 'promote', target: group, targetUser: user, result: { success: false, error: error instanceof Error ? error.message : String(error) } });
      spinner.fail('Failed to promote user');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
