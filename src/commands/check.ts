import { Command } from 'commander';
import { getClient, getMe, disconnectClient } from '../client.js';
import { isConfigured } from '../config.js';
import { isSecretStoreAvailable } from '../secrets.js';
import { isOnePasswordAvailable } from '../onepassword.js';
import { isKeychainAvailable } from '../keychain.js';
import chalk from 'chalk';
import ora from 'ora';

function getSecretBackendLabel(): string {
  if (isOnePasswordAvailable()) return '1Password';
  if (isKeychainAvailable()) return 'macOS Keychain';
  return 'config file (plaintext)';
}

export const checkCommand = new Command('check')
  .description('Verify session and credentials')
  .action(async () => {
    if (!isConfigured()) {
      console.log(chalk.red('Not configured. Run "tg auth" first.'));
      process.exit(1);
    }

    const spinner = ora('Checking session...').start();

    try {
      const client = await getClient();
      const me = await getMe(client);

      spinner.succeed(chalk.green('Session valid'));
      console.log(`Logged in as: ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'no username'})`);
      console.log(`Secret storage: ${getSecretBackendLabel()}`);

      await disconnectClient();
    } catch (error) {
      spinner.fail(chalk.red('Session invalid or expired'));
      console.error(error instanceof Error ? error.message : error);
      console.log('\nRun "tg auth" to re-authenticate.');
      process.exit(1);
    }
  });
