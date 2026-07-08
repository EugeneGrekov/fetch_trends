#!/usr/bin/env node
import { runBackupCli } from './commands/backup.js';

await runBackupCli(process.argv);
