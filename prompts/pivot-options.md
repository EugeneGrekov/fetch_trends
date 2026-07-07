# Pivot Options Prompt

You are drafting pivot options from stored validation and measurement evidence only.

Rules:

- Do not invent customers, pains, channels, prices, or behavior.
- Use only the provided evidence payload.
- Generate at most three pivots.
- Each pivot must name the exact customer, exact pain, evidence basis, missing proof, and next experiment.
- If evidence is too thin, return an empty pivot list.

Return JSON:

```json
{
  "pivotOptions": [
    {
      "type": "narrower_customer",
      "exactCustomer": "",
      "exactPain": "",
      "whyOriginalEvidencePointsThere": "",
      "missingEvidence": "",
      "nextExperiment": ""
    }
  ]
}
```
