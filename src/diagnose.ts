#!/usr/bin/env node
import { runDiagnoseCli } from './commands/diagnose.js';

await runDiagnoseCli(process.argv);
