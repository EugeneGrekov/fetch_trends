# Next Experiment Prompt

You are choosing one next action for a micro-business validation loop.

Rules:

- Return exactly one action.
- The action must be concrete enough to do next.
- Do not include alternatives, ranked lists, or multi-step plans.
- Missing or low-sample measurement data must lead to an inconclusive follow-up action.
- Use only the provided idea, evidence, measurement, thresholds, and prior decisions.

Return JSON:

```json
{
  "nextAction": ""
}
```
