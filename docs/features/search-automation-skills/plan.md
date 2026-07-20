# Search Automation Skills Plan

## Goal
Update project-local Codex skills so automated validation runs can safely use SERP-backed external search collectors with credit checks, scoped collector selection, and clear error handling.

## Prerequisite
Autocomplete discovery modes and external collectors must already exist.

## Non-Goals
- Do not change the `npm run validate` command behavior.
- Do not add a new external provider.
- Do not store SerpAPI account data in SQLite.
- Do not expose or print secret API keys.

## Target Structure
- Add a small skill helper script under `.codex/skills/micro-business-validate/scripts/`.
- Update `.codex/skills/micro-business-validate/SKILL.md`.
- Add cross-reference guardrails in autocomplete/report skills when useful.
- Record implementation notes under `docs/features/search-automation-skills/`.

## Implementation Steps
1. Add a SerpAPI account preflight script that reads `SERP_API_KEY`, calls the free account endpoint, redacts secrets, and optionally checks a needed-credit estimate.
2. Update the validate skill to run the preflight before `--external true` searches.
3. Document low-credit and full-collector command recipes.
4. Document how to inspect external collector warnings, blocked runs, and report output.
5. Validate edited skills with `quick_validate.py`.

## Data / API / CLI Contracts
- The helper script command is:

```bash
node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 32
```

- Full external search can use up to 32 SerpAPI credits because up to 8 queries feed 4 SERP-backed collectors: SERP, Reddit, YouTube, and reviews.
- Low-credit SERP-only search can use up to 8 SerpAPI credits.
- Competitor fetching uses SERP candidates but does not itself spend SerpAPI credits.
- The script must not print `SERP_API_KEY`.

## Testing Plan
- Run the script without `SERP_API_KEY` and verify it fails cleanly.
- Validate edited skills with the system `quick_validate.py` script.
- No live SerpAPI call is required for default verification.

## Verification
Normally:

```bash
npm test
npm run build
npm run lint
```

For this skill-only update, use:

```bash
env -u SERP_API_KEY node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 32
python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-validate
python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-autocomplete
python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-report
```

## Acceptance Criteria
- The validate skill tells Codex to check SerpAPI credits before external search.
- The validate skill provides full and low-credit external collector recipes.
- The report skill tells Codex to preserve collector warnings and errors.
- The helper script redacts secrets and exits non-zero when credentials are missing.

## Risks
- SerpAPI account fields may vary by plan; the helper should tolerate missing optional fields.
- Live account checks depend on network availability and valid credentials.
- `npm run validate` still uses the older autocomplete defaults until a separate validation CLI alignment phase.

## Recommended Next Phase
Align `npm run validate` with autocomplete discovery modes so validation jobs can request organic-only autocomplete evidence directly.
