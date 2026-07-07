import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { createToolRun, completeToolRun, failToolRun, blockToolRun } from '../db/repositories/tool-runs.js';
import { CodexCliExecutor, CodexUnavailableError } from './codex-runner.js';
import { parseJsonOutput } from './json-output.js';
import { buildPrompt, loadPromptTemplate } from './prompt-loader.js';
import type {
  AiArtifactPaths,
  AiExecutionResult,
  AiExecutor,
  AiRunMetadata,
  AiTaskName,
  RunAiTaskOptions,
  RunAiTaskResult,
} from './types.js';

const TOOL_NAME_BY_TASK: Record<AiTaskName, string> = {
  idea_normalize: 'ai.idea_normalize',
  query_generate: 'ai.query_generate',
  evidence_summarize: 'ai.evidence_summarize',
  score_explain: 'ai.score_explain',
  final_report: 'ai.final_report',
};

const ARTIFACT_LABEL_BY_TASK: Record<AiTaskName, string> = {
  idea_normalize: 'idea-normalize',
  query_generate: 'query-generate',
  evidence_summarize: 'evidence-summarize',
  score_explain: 'score-explain',
  final_report: 'final-report',
};

export interface LocalAiRunnerOptions {
  artifactsRoot: string;
  db: DatabaseSync;
  executor?: AiExecutor;
  keepArtifacts: boolean;
  model?: string;
  reasoning?: string;
}

export class LocalAiRunner {
  private readonly artifactsRoot: string;

  private readonly db: DatabaseSync;

  private readonly executor: AiExecutor;

  private readonly keepArtifacts: boolean;

  private readonly model?: string;

  private readonly reasoning?: string;

  constructor(options: LocalAiRunnerOptions) {
    this.artifactsRoot = options.artifactsRoot;
    this.db = options.db;
    this.executor = options.executor ?? new CodexCliExecutor();
    this.keepArtifacts = options.keepArtifacts;
    this.model = options.model;
    this.reasoning = options.reasoning;
  }

  async runTask<TInput, TOutput>(options: RunAiTaskOptions<TInput>): Promise<RunAiTaskResult<TOutput>> {
    const keepArtifacts = options.keepArtifacts ?? this.keepArtifacts;
    const model = options.model ?? this.model;
    const reasoning = options.reasoning ?? this.reasoning;
    const startedAt = new Date().toISOString();
    const { fileName, template } = await loadPromptTemplate(options.task);
    const prompt = buildPrompt(template, options.input);

    const initialMetadata = buildMetadata({
      artifacts: {},
      keepArtifacts,
      promptFile: fileName,
      task: options.task,
      model,
      reasoning,
    });
    const toolRun = createToolRun(this.db, {
      jobId: options.jobId,
      toolName: TOOL_NAME_BY_TASK[options.task],
      inputJson: JSON.stringify(options.input),
      metadataJson: JSON.stringify(initialMetadata),
      status: 'running',
      startedAt,
    });

    let isolationDir: string | undefined;
    let rawOutput = '';
    let execResult: AiExecutionResult | undefined;
    let artifactPaths: AiArtifactPaths = {};

    try {
      isolationDir = await mkdtemp(join(tmpdir(), 'fetch-trends-ai-'));
      const artifactLabel = `${ARTIFACT_LABEL_BY_TASK[options.task]}-run-${toolRun.id}`;
      const tempOutputPath = join(isolationDir, `${artifactLabel}.output.txt`);

      artifactPaths = keepArtifacts
        ? await writeTaskArtifacts({
            artifactLabel,
            artifactsRoot: this.artifactsRoot,
            inputJson: JSON.stringify(options.input, null, 2),
            jobId: options.jobId,
            prompt,
          })
        : {};

      execResult = await this.executor.execute({
        isolationDir,
        outputPath: tempOutputPath,
        prompt,
        model,
        reasoning,
      });
      rawOutput = await readFile(tempOutputPath, 'utf8');

      if (execResult.exitCode !== 0) {
        throw new Error(execResult.stderr.trim() || `Codex exited with code ${execResult.exitCode}.`);
      }

      if (keepArtifacts && artifactPaths.outputTextPath) {
        await rename(tempOutputPath, artifactPaths.outputTextPath);
      }

      const parsed = parseJsonOutput<TOutput>(rawOutput);
      const metadata = buildMetadata({
        artifacts: artifactPaths,
        command: execResult.command,
        durationMs: execResult.durationMs,
        keepArtifacts,
        model,
        promptFile: fileName,
        reasoning,
        task: options.task,
      });

      completeToolRun(
        this.db,
        toolRun.id,
        JSON.stringify(parsed),
        new Date().toISOString(),
        JSON.stringify(metadata),
      );

      if (keepArtifacts && artifactPaths.metadataJsonPath) {
        await writeFile(artifactPaths.metadataJsonPath, JSON.stringify(metadata, null, 2));
      }

      return {
        metadata,
        output: parsed,
        rawOutput,
        status: 'completed',
        toolRunId: toolRun.id,
      };
    } catch (error) {
      if (keepArtifacts && rawOutput && artifactPaths.outputTextPath) {
        await writeFile(artifactPaths.outputTextPath, rawOutput);
      } else if (keepArtifacts && execResult?.outputPath && artifactPaths.outputTextPath) {
        await tryCopy(execResult.outputPath, artifactPaths.outputTextPath);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const metadata = buildMetadata({
        artifacts: artifactPaths,
        command: execResult?.command,
        durationMs: execResult?.durationMs,
        keepArtifacts,
        model,
        promptFile: fileName,
        reasoning,
        task: options.task,
      });
      const metadataJson = JSON.stringify(metadata);
      const completedAt = new Date().toISOString();

      if (error instanceof CodexUnavailableError) {
        blockToolRun(this.db, toolRun.id, errorMessage, completedAt, undefined, metadataJson);
      } else {
        failToolRun(this.db, toolRun.id, errorMessage, completedAt, undefined, metadataJson);
      }

      if (keepArtifacts && artifactPaths.metadataJsonPath) {
        await writeFile(
          artifactPaths.metadataJsonPath,
          JSON.stringify(
            {
              ...metadata,
              errorMessage,
            },
            null,
            2,
          ),
        );
      }

      return {
        errorMessage,
        metadata,
        rawOutput: rawOutput || undefined,
        status: error instanceof CodexUnavailableError ? 'blocked' : 'failed',
        toolRunId: toolRun.id,
      };
    } finally {
      if (isolationDir) {
        await rm(isolationDir, { force: true, recursive: true });
      }
    }
  }
}

async function writeTaskArtifacts(args: {
  artifactLabel: string;
  artifactsRoot: string;
  inputJson: string;
  jobId: number;
  prompt: string;
}): Promise<AiArtifactPaths> {
  const jobDir = join(args.artifactsRoot, `job-${args.jobId}`);
  await mkdir(jobDir, { recursive: true });

  const inputJsonPath = join(jobDir, `${args.artifactLabel}.input.json`);
  const promptTextPath = join(jobDir, `${args.artifactLabel}.prompt.txt`);
  const outputTextPath = join(jobDir, `${args.artifactLabel}.output.txt`);
  const metadataJsonPath = join(jobDir, `${args.artifactLabel}.metadata.json`);

  await writeFile(inputJsonPath, `${args.inputJson}\n`);
  await writeFile(promptTextPath, `${args.prompt}\n`);

  return {
    inputJsonPath,
    metadataJsonPath,
    outputTextPath,
    promptTextPath,
  };
}

function buildMetadata(args: {
  artifacts: AiArtifactPaths;
  command?: string[];
  durationMs?: number;
  keepArtifacts: boolean;
  model?: string;
  promptFile: string;
  reasoning?: string;
  task: AiTaskName;
}): AiRunMetadata {
  return {
    artifacts: args.artifacts,
    command: args.command,
    durationMs: args.durationMs,
    executor: 'codex',
    model: args.model,
    outputKept: args.keepArtifacts,
    promptFile: args.promptFile,
    reasoning: args.reasoning,
    task: args.task,
  };
}

async function tryCopy(fromPath: string, toPath: string): Promise<void> {
  try {
    await copyFile(fromPath, toPath);
  } catch {
    return;
  }
}
