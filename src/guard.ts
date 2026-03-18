import { secretGet, isSecretStoreAvailable } from './secrets.js';
import chalk from 'chalk';

export function assertWriteEnabled(): void {
  if (!isSecretStoreAvailable()) {
    console.error(chalk.red('Write access requires a secret store (macOS Keychain or 1Password).'));
    console.error(chalk.gray('This ensures write permissions cannot be tampered with via config files.'));
    process.exit(1);
  }

  const value = secretGet('writeEnabled');
  if (value !== 'true') {
    console.error(chalk.red('Write access is disabled (read-only mode).'));
    console.error(chalk.gray('To enable writes: telegram write-access on'));
    process.exit(1);
  }
}
