#!/usr/bin/env node
import { runMeasurementCli } from './commands/measurement.js';

await runMeasurementCli(process.argv);
