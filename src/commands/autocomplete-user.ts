#!/usr/bin/env node
import { Command } from 'commander';
import { stdin, stdout } from 'node:process';
import { resolveAuthConfigPath, upsertAuthUser } from '../autocomplete-bridge/auth.js';

const program = new Command();

program
  .name('fetch-trends-autocomplete-user')
  .description('Manage local users for the ChatGPT autocomplete bridge.');

program
  .command('add')
  .description('Create or replace one local user and invalidate its previous token.')
  .requiredOption('--username <username>', 'local username')
  .option('--auth-config <path>', 'local authentication config path', './config/autocomplete-users.json')
  .action(async (options: { username: string; authConfig: string }) => {
    const password = await readSecret('Password: ');
    const confirmation = await readSecret('Confirm password: ');

    if (password !== confirmation) {
      throw new Error('Passwords do not match.');
    }

    const configPath = resolveAuthConfigPath(options.authConfig);
    await upsertAuthUser(configPath, options.username, password);
    process.stdout.write(`Stored hashed credentials for ${options.username.trim()} in ${configPath}.\n`);
  });

await program.parseAsync(process.argv);

async function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('This command requires an interactive terminal.');
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise<string>((resolvePromise, rejectPromise) => {
    let value = '';

    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          rejectPromise(new Error('Cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          resolvePromise(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= ' ') {
          value += character;
        }
      }
    };

    stdin.on('data', onData);
  });
}
