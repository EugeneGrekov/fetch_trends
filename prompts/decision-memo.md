# Decision Memo Prompt

Draft a concise decision memo from the provided structured decision-loop payload.

Required sections:

- Current idea.
- Evidence summary.
- Measurement summary.
- Decision.
- Reason.
- Prior decisions.
- Pivot options if applicable.
- Single next action.
- What would change the decision.

Rules:

- Do not add evidence that is not in the payload.
- Preserve the deterministic decision, confidence, reason, and next action.
- Mark assumptions and missing proof explicitly.
- Keep low-sample or missing measurement data inconclusive.
