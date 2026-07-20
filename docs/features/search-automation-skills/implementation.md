# Search Automation Skills Implementation

## Summary
Project-local skills now automate external search validation more safely.
The validate skill performs a SerpAPI account preflight before SERP-backed collector runs, documents full and low-credit collector recipes, and tells agents to surface quota, warning, and blocked-collector states.

## Files / Modules Added Or Changed
- `.codex/skills/micro-business-validate/SKILL.md`
- `.codex/skills/micro-business-validate/scripts/README.md`
- `.codex/skills/micro-business-validate/scripts/serpapi-account.mjs`
- `.codex/skills/micro-business-autocomplete/SKILL.md`
- `.codex/skills/micro-business-report/SKILL.md`
- `docs/features/README.md`
- `docs/features/search-automation-skills/README.md`
- `docs/features/search-automation-skills/plan.md`

## Commands Added Or Changed
- Added skill helper:

```bash
node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 32
```

For low-credit SERP-only runs:

```bash
node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 8
```

- Documented full external validation:

```bash
npm run validate -- --idea "<idea>" --country US --external true --serp true --reddit true --youtube true --reviews true --competitors true --ai false
```

- Documented low-credit validation:

```bash
npm run validate -- --idea "<idea>" --country US --external true --serp true --reddit false --youtube false --reviews false --competitors false --ai false
```

## Schema / Migration Changes
None.

## Tests Added Or Updated
- Added script syntax verification with `node --check`.
- Added safe missing-key verification for the SerpAPI preflight helper.
- Revalidated all edited skills with `quick_validate.py`.

## Verification Results
- `env -u SERP_API_KEY node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 32` failed safely with exit code 2 and message `SERP_API_KEY is missing. Set it before running external search collectors.`
- `node --check .codex/skills/micro-business-validate/scripts/serpapi-account.mjs` passed.
- `python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-validate` passed.
- `python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-autocomplete` passed.
- `python3 /Users/egrekov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/micro-business-report` passed.
- `git diff --check -- .codex/skills docs/features/search-automation-skills docs/features/README.md docs/features/codex-skills/implementation.md` passed.

## Known Limitations
- No live SerpAPI account check was run during verification.
- `npm run validate` still uses the older autocomplete option path; run `npm run autocomplete -- --mode organic` separately when clean organic-only autocomplete evidence is required.
- The helper reads current account usage only; it does not reserve credits.

## Follow-Up Work
- Align `npm run validate` with autocomplete discovery modes.
- Optionally add a first-class CLI command for provider credit checks if this workflow becomes frequent outside Codex skills.
