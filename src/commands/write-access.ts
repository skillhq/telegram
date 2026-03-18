import { Command } from 'commander';
import { secretGet, secretSet, secretDelete, isSecretStoreAvailable } from '../secrets.js';
import chalk from 'chalk';

export const writeAccessCommand = new Command('write-access')
  .description('Manage write access (read-only mode by default)')
  .argument('[action]', 'on, off, or omit to show status')
  .action((action?: string) => {
    if (!isSecretStoreAvailable()) {
      console.error(chalk.red('No secret store available (macOS Keychain or 1Password required).'));
      console.error(chalk.gray('Write access control requires a secret store to prevent tampering.'));
      process.exit(1);
    }

    if (action === 'on') {
      const ok = secretSet('writeEnabled', 'true');
      if (ok) {
        console.log(chalk.green('Write access enabled.'));
        console.log(chalk.gray('Write commands (send, reply, kick, etc.) are now allowed.'));
      } else {
        console.error(chalk.red('Failed to enable write access.'));
        process.exit(1);
      }
    } else if (action === 'off') {
      secretDelete('writeEnabled');
      console.log(chalk.yellow('Write access disabled (read-only mode).'));
      console.log(chalk.gray('Write commands will be blocked until you run: telegram write-access on'));
    } else if (!action) {
      const value = secretGet('writeEnabled');
      const enabled = value === 'true';
      if (enabled) {
        console.log(chalk.green('Write access: enabled'));
      } else {
        console.log(chalk.yellow('Write access: disabled (read-only mode)'));
        console.log(chalk.gray('To enable: telegram write-access on'));
      }
    } else {
      console.error(chalk.red(`Unknown action: ${action}`));
      console.error(chalk.gray('Usage: telegram write-access [on|off]'));
      process.exit(1);
    }
  });
