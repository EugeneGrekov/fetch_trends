# AI Runner Implementation Notes

This implementation pass adds the missing runtime pieces that the existing
AI-runner docs and validation flow already reference:

- `src/ai/`
  - Codex executor
  - prompt loader
  - JSON output parser
  - public local AI runner
  - focused unit tests
- `prompts/`
  - strict templates for normalization, query generation, evidence summary,
    score explanation, and final report drafting
- `src/validation/orchestrator.test.ts`
  - fallback coverage when AI returns invalid JSON

Supporting updates in this same pass:

- ignore `artifacts/` in git and ESLint
- keep generated AI artifacts outside `dist/`

Verification in this pass was limited to targeted TypeScript transpilation for
the changed files because the repo-wide Node build/test commands were not
terminating cleanly in this shell session.
