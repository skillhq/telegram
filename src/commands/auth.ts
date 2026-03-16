import { Command } from 'commander';
import { authenticate } from '../auth.js';
import { isConfigured, saveConfig } from '../config.js';
import ora from 'ora';

export const authCommand = new Command('auth')
  .description('Authenticate with Telegram')
  .option('--op-vault <vault>', 'Set 1Password vault for secret storage')
  .action(async (opts: { opVault?: string }) => {
    // Save op vault config if provided (before auth, so secrets route there)
    if (opts.opVault) {
      saveConfig({ opVault: opts.opVault });
      console.log(`1Password vault set to: ${opts.opVault}`);
    }

    if (isConfigured()) {
      console.log('Already configured. Run "tg check" to verify your session.');
      console.log('To re-authenticate, delete ~/.config/tg/config.json5 and run "tg auth" again.');
      return;
    }

    try {
      const client = await authenticate();
      await client.disconnect();
    } catch (error) {
      console.error('Authentication failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
