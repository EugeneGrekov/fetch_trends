# Scripts

This directory contains project maintenance, verification, release, roadmap, and documentation-check scripts.

Common scripts are exposed through `package.json`:

- `npm run roadmap:check`
- `npm run backlog:check`
- `npm run release:check`
- `npm run package:local`

Keep scripts deterministic and local-first. Default checks should not require live external services.
