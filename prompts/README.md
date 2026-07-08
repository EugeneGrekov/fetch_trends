# Prompts

This directory contains prompt templates used by the bounded AI runner.

Prompt files should:

- constrain the model to local stored evidence
- require structured output where the caller expects JSON
- avoid unsupported claims about market size or demand volume
- preserve the evidence-first validation model

Update prompt-loader tests when changing template loading behavior.
