#!/usr/bin/env node
import { runRestoreCli } from './commands/restore.js';

await runRestoreCli(process.argv);
