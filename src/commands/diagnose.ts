import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  renderDiagnosticReportJson,
  renderDiagnosticReportMarkdown,
  runDiagnostics,
} from '../diagnostics/report.js';
import type { DiagnosticReport, DiagnosticRunOptions } from '../diagnostics/types.js';

export interface DiagnoseProgramDependencies {
  runDiagnostics?: (options: DiagnosticRunOptions) => Promise<DiagnosticReport>;
  stderr?: OutputSink;
  stdout?: OutputSink;
}

interface OutputSink {
  write(chunk: string): unknown;
}

export function buildDiagnoseProgram(dependencies: DiagnoseProgramDependencies = {}): Command {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const run = dependencies.runDiagnostics ?? runDiagnostics;

  return new Command()
    .name('fetch-trends-diagnose')
    .description('Run local operator diagnostics without exposing secrets.')
    .option('--db <path>', 'SQLite database path')
    .option('--json', 'print JSON output instead of Markdown')
    .option('--out <path>', 'write the diagnostic report to a file instead of stdout')
    .option('--live', 'allow opt-in live checks when implemented')
    .option('--resultsDir <path>', 'results directory to inspect')
    .option('--artifactsDir <path>', 'artifact directory to inspect')
    .action(async (options: {
      artifactsDir?: string;
      db?: string;
      json?: boolean;
      live?: boolean;
      out?: string;
      resultsDir?: string;
    }) => {
      try {
        const report = await run({
          artifactsDir: options.artifactsDir,
          dbPath: options.db,
          live: options.live ?? false,
          resultsDir: options.resultsDir,
        });
        const rendered = options.json
          ? `${renderDiagnosticReportJson(report)}\n`
          : renderDiagnosticReportMarkdown(report);

        if (options.out) {
          const outPath = resolve(process.cwd(), options.out);
          await mkdir(dirname(outPath), { recursive: true });
          await writeFile(outPath, rendered);
          stdout.write(`Wrote diagnostic report to ${outPath}\n`);
          return;
        }

        stdout.write(rendered);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runDiagnoseCli(argv: string[]): Promise<void> {
  await buildDiagnoseProgram().parseAsync(argv);
}
