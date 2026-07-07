import { spawn } from 'node:child_process';
import type { AiExecutionRequest, AiExecutionResult, AiExecutor } from './types.js';

export class CodexUnavailableError extends Error {}

export class CodexCliExecutor implements AiExecutor {
  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const command = buildCommand(request);
    const startedAt = Date.now();

    return new Promise<AiExecutionResult>((resolve, reject) => {
      const child = spawn(command[0] ?? 'codex', command.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new CodexUnavailableError('Codex CLI is not installed or not available on PATH.'));
          return;
        }

        reject(error);
      });
      child.on('close', (exitCode) => {
        resolve({
          command,
          durationMs: Date.now() - startedAt,
          exitCode: exitCode ?? -1,
          outputPath: request.outputPath,
          stderr,
          stdout,
        });
      });

      child.stdin.end(request.prompt);
    });
  }
}

function buildCommand(request: AiExecutionRequest): string[] {
  const command = [
    'codex',
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '-s',
    'read-only',
    '-C',
    request.isolationDir,
    '-c',
    'default_tools_enabled=false',
  ];

  if (request.model) {
    command.push('-m', request.model);
  }

  if (request.reasoning) {
    command.push('-c', `model_reasoning_effort="${request.reasoning}"`);
  }

  command.push('-o', request.outputPath, '-');

  return command;
}
