# Config

This directory contains local configuration examples and defaults.

Files:

- `collectors.json` defines collector defaults and provider behavior.
- `autocomplete-users.example.json` shows the empty, nonsecret shape for local bridge users.
- `example.env` documents environment variables without storing secrets.

The generated `autocomplete-users.json` stores salted password hashes and
hashed tokens and is ignored by Git. Do not commit it, real API keys, local
`.env` files, or machine-specific credentials.
