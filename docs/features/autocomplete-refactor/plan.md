# Autocomplete Utility Refactor Plan

## Goal

Move the existing autocomplete functionality into the architecture-defined utility boundary without changing behavior.

This is a structural refactor only.

Do not add:

- SQLite.
- AI runner.
- Codex skills.
- Web UI.
- New command router.
- New validation behavior.

## Why This Comes First

The current autocomplete CLI is the first working validation utility. Before adding persistence, AI analysis, Codex skills, or a web interface, it needs to live behind a clean reusable module boundary.

Target boundary:

```text
src/utilities/autocomplete/
```

The existing public command must keep working:

```bash
npm run autocomplete
```

## Baseline Check

Run deterministic checks before moving files:

```bash
npm test
npm run build
npm run lint
```

If any check fails before the refactor, record the failure and do not mix unrelated fixes into the move unless required to proceed.

## File Moves

Create:

```text
src/utilities/autocomplete/
```

Move source files:

```text
src/analysis.ts    -> src/utilities/autocomplete/analysis.ts
src/collector.ts   -> src/utilities/autocomplete/collector.ts
src/constants.ts   -> src/utilities/autocomplete/constants.ts
src/exporter.ts    -> src/utilities/autocomplete/exporter.ts
src/expansion.ts   -> src/utilities/autocomplete/expansion.ts
src/input.ts       -> src/utilities/autocomplete/input.ts
src/normalize.ts   -> src/utilities/autocomplete/normalize.ts
src/runner.ts      -> src/utilities/autocomplete/runner.ts
src/types.ts       -> src/utilities/autocomplete/types.ts
src/cli.ts         -> src/utilities/autocomplete/cli.ts
```

Move tests with the implementation:

```text
src/analysis.test.ts  -> src/utilities/autocomplete/analysis.test.ts
src/input.test.ts     -> src/utilities/autocomplete/input.test.ts
src/runner.test.ts    -> src/utilities/autocomplete/runner.test.ts
src/expansion.test.ts -> src/utilities/autocomplete/expansion.test.ts
```

Moving tests with the source keeps existing relative imports simple and verifies the new utility boundary.

## Compatibility Entrypoint

Recreate:

```text
src/cli.ts
```

as a thin wrapper:

```ts
#!/usr/bin/env node
import './utilities/autocomplete/cli.js';
```

This preserves:

```json
"autocomplete": "tsx src/cli.ts"
```

and:

```json
"bin": {
  "fetch-trends-autocomplete": "./dist/src/cli.js"
}
```

Do not change `package.json` in this refactor.

## Import Updates

Most imports should not need changes because moved files remain colocated.

Internal utility imports should remain like:

```ts
import { runAutocompleteResearch } from './runner.js';
import type { RunOptions } from './types.js';
```

Moved tests should keep imports like:

```ts
import { buildUniquePredictions } from './analysis.js';
```

The only expected new import is in the root compatibility wrapper:

```ts
import './utilities/autocomplete/cli.js';
```

Avoid unnecessary long relative import paths.

## Verification

After the move, run:

```bash
npm test
npm run build
npm run lint
```

Optional smoke command:

```bash
npm run autocomplete -- --seed "find my parked car" --depth 1 --maxPrefixes 1 --delayMs 0 --out ./results/smoke.csv
```

The smoke command may hit Google, network, or CAPTCHA behavior, so it is optional. The deterministic checks are the primary verification.

## Expected Build Shape

After `npm run build`, compiled output should include:

```text
dist/src/cli.js
dist/src/utilities/autocomplete/analysis.js
dist/src/utilities/autocomplete/collector.js
dist/src/utilities/autocomplete/runner.js
dist/src/utilities/autocomplete/cli.js
```

`dist/src/cli.js` should remain the package bin entrypoint.

## Risks

- The root wrapper must keep the shebang because `package.json` points the binary to `dist/src/cli.js`.
- Do not change CLI options, defaults, output names, resume behavior, CSV columns, or JSON shape.
- Do not change Google collection behavior.
- Do not introduce SQLite or validation orchestration in this slice.
- A live smoke test can fail for external reasons unrelated to the refactor.

## Acceptance Criteria

- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.
- `npm run autocomplete` still invokes the same CLI behavior.
- Existing README examples remain valid.
- Autocomplete functionality is isolated under `src/utilities/autocomplete/`.
- No SQLite, AI runner, web UI, Codex skills, or new validation behavior are introduced.

## Next Step After This Refactor

After this refactor is complete and verified, start the SQLite persistence foundation:

```text
src/db/
```

with migrations and repositories for ideas, jobs, tool runs, queries, autocomplete predictions, scores, and reports.
