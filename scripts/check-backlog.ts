#!/usr/bin/env node
import { resolve } from 'node:path';
import { checkBacklog } from './backlog-support.js';

const args = process.argv.slice(2);
const projectRoot = resolve(process.cwd());

let backlogFile: string | undefined;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--file') {
    backlogFile = args[index + 1];
    index += 1;
    continue;
  }

  throw new Error(`Unknown argument: ${argument}`);
}

if (args.includes('--file') && !backlogFile) {
  throw new Error('Missing value for --file.');
}

try {
  const result = await checkBacklog(projectRoot, { file: backlogFile });

  for (const issue of result.issues) {
    const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
    process.stdout.write(`${prefix}: ${issue.message}\n`);
  }

  process.stdout.write(`${result.errorCount > 0 ? 'Backlog check failed.' : 'Backlog check passed.'}\n`);
  process.stdout.write(`Files checked: ${result.checkedFileCount}\n`);
  process.stdout.write(`Missing: ${result.missingCount}\n`);
  process.stdout.write(`Warnings: ${result.warningCount}\n`);

  if (result.errorCount > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Backlog check failed: ${message}\n`);
  process.exitCode = 1;
}
