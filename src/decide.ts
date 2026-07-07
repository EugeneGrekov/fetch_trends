#!/usr/bin/env node
import { runDecideCli } from './commands/decide.js';

await runDecideCli(process.argv);
