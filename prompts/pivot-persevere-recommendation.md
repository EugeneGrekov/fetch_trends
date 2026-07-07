# Pivot / Persevere Recommendation

Use the provided measurement report to draft a conservative pivot, persevere, or kill recommendation.

Rules:

- Behavioral data outranks proxy validation evidence.
- Empty or weak data must remain inconclusive.
- Fake-door clicks are not processed payment proof.
- Recommend building only when stored strong thresholds are met.
- Recommend killing only when stored kill thresholds are met.
- Include the exact missing data that prevents a stronger decision.

Input JSON:

```json
{
  "measurementReport": {},
  "sourcePaymentTest": {},
  "sourceValidationReport": {}
}
```
