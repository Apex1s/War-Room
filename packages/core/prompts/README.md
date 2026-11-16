# Agent prompts

The six prompts behind `run(task, input)`. One file per task, no dependencies outside this folder.

| File | Task | Runs on | Sees |
|---|---|---|---|
| `redact.ts` | `redact` | Gemini Nano, on-device only | raw text |
| `referee-live.ts` | `referee_live` | Gemini Nano, on-device only | raw draft |
| `crowd.ts` | `crowd` | on-device preferred, cloud fallback | abstracted |
| `referee-round.ts` | `referee_round` | on-device preferred, cloud fallback | abstracted |
| `general-move.ts` | `general_move` | cloud | abstracted |
| `final-report.ts` | `final_report` | cloud | abstracted |
| `repair.ts` | (any) | same model as the failed call | the invalid reply |

Each task exports a `PromptSpec`: `system(input)`, `user(input)` and `target`. `index.ts` collects them in `PROMPTS`. `src/ai/tasks.ts` pairs each one with its zod schema, privacy class and `normalize` step.

## Rules for changing these files

- The field names described in each system prompt must match the zod schema in `src/ai/schemas.ts`. Change both or neither.
- On-device prompts stay short, do one thing and return JSON only. Inputs are clipped to `LIMITS` in `types.ts`. Do not add examples or sections without re-measuring latency on Nano.
- `redact` must never clip its input: unscanned text is a leak. It throws if the chunk is too long; the firewall does the chunking.
- Cloud prompts explain the purpose and the reason for each instruction. Keep the token rules (use `[COMPANY_1]` exactly, never guess, never invent) in both cloud prompts; re-hydration depends on them.
- No imports from outside this folder, and no model names here. Routing and models live in Remote Config.
- These prompts have been typechecked and rendered with sample data, not yet run against the models. Record tuning results in `docs/02-prompts-and-schemas.md` §8.
