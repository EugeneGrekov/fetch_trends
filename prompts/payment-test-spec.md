# Payment Test Spec Prompt

Use this prompt only with stored evidence and reports.

Output a payment-intent test spec with one of these decisions:

- `not_justified`
- `fake_door`
- `preorder`
- `concierge`
- `paid_preview`

Every justified spec must include:

- Exact target user.
- Exact painful task.
- Test type.
- Offer headline.
- One-time price hypothesis.
- CTA.
- Trust claims.
- Before/after explanation.
- Three-step workflow.
- FAQ.
- Analytics events.
- Decision thresholds.
- Risks.
- Required missing proof.

Required warning:

```text
This is a payment-intent test, not proof that the business is validated.
```

Weak ideas must produce `not_justified`, explain why, and avoid landing page
copy that makes the idea sound validated.
