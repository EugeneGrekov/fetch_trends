#!/usr/bin/env node
import { runExportDataCli } from './commands/export-data.js';

await runExportDataCli(process.argv);
