#!/usr/bin/env node
import { resolve } from 'node:path';
import { checkRoadmap } from './roadmap-support.js';

const projectRoot = resolve(process.cwd());

try {
  const result = await checkRoadmap(projectRoot);

  for (const issue of result.issues) {
    const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
    process.stdout.write(`${prefix}: ${issue.message}\n`);
  }

  process.stdout.write(`${result.errorCount > 0 ? 'Roadmap check failed.' : 'Roadmap check passed.'}\n`);
  process.stdout.write(`Plans: ${result.planCount}\n`);
  process.stdout.write(`Implementation notes: ${result.implementationNoteCount}\n`);
  process.stdout.write(`Missing: ${result.missingCount}\n`);
  process.stdout.write(`Warnings: ${result.warningCount}\n`);

  if (result.errorCount > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Roadmap check failed: ${message}\n`);
  process.exitCode = 1;
}
