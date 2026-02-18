import { Command } from 'commander';
import { clearSessionString } from '../config.js';
import { auditLog } from '../audit.js';
import chalk from 'chalk';
import ora from 'ora';

export const logoutCommand = new Command('logout')
  .description('Clear saved session (log out)')
  .action(async () => {
    const spinner = ora('Logging out...').start();

    try {
      clearSessionString();

      auditLog({
        timestamp: new Date().toISOString(),
        command: 'logout',
        target: '',
        result: { success: true },
      });

      spinner.succeed(chalk.green('Logged out. Run "tg auth" to re-authenticate.'));
    } catch (error) {
      auditLog({
        timestamp: new Date().toISOString(),
        command: 'logout',
        target: '',
        result: { success: false, error: error instanceof Error ? error.message : String(error) },
      });

      spinner.fail(chalk.red('Failed to log out'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
