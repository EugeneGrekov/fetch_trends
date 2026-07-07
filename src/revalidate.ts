#!/usr/bin/env node
import { runRevalidateCli } from './commands/revalidate.js';

await runRevalidateCli(process.argv);
