# Measurement Summary

Summarize post-launch experiment behavior from the provided local measurement report.

Rules:

- Separate recorded facts from interpretation.
- Do not infer demand size.
- Treat low-sample or missing behavior as inconclusive.
- Call out threshold assumptions and missing data.
- Recommend only one of: continue_test, build_mvp, validate_deeper, pivot, kill, inconclusive.

Input JSON:

```json
{
  "experiment": {},
  "metrics": {},
  "thresholdResults": [],
  "recommendation": {}
}
```
