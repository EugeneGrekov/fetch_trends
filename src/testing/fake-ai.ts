import { writeFile } from 'node:fs/promises';
import type { AiExecutionRequest, AiExecutionResult, AiExecutor } from '../ai/types.js';

export class StaticJsonAiExecutor implements AiExecutor {
  constructor(private readonly output: unknown = {}) {}

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const stdout = JSON.stringify(this.output);
    await writeFile(request.outputPath, stdout);
    return fakeAiExecutionResult(request, stdout);
  }
}

export class InvalidJsonAiExecutor implements AiExecutor {
  constructor(private readonly output = 'definitely not json') {}

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    await writeFile(request.outputPath, this.output);
    return fakeAiExecutionResult(request, this.output);
  }
}

function fakeAiExecutionResult(request: AiExecutionRequest, stdout: string): AiExecutionResult {
  return {
    command: ['fake-codex'],
    durationMs: 5,
    exitCode: 0,
    outputPath: request.outputPath,
    stderr: '',
    stdout,
  };
}
