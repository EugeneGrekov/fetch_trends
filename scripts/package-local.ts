#!/usr/bin/env node
import { resolve } from 'node:path';
import { buildLocalPackage } from './release-support.js';

try {
  const outDir = parseOutDir(process.argv.slice(2));
  const copied = await buildLocalPackage({
    outDir,
    projectRoot: process.cwd(),
  });

  process.stdout.write(`Local package written to ${resolve(process.cwd(), outDir)}\n`);
  for (const entry of copied) {
    process.stdout.write(`Included ${entry.label}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}

function parseOutDir(args: string[]): string {
  const outIndex = args.indexOf('--out');
  if (outIndex === -1) {
    return './dist-package/fetch-trends';
  }

  const value = args[outIndex + 1];
  if (!value) {
    throw new Error('Pass a value after --out.');
  }

  return value;
}
