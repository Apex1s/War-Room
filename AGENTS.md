# Project: War Room, confidential AI war-gaming
Hackathon: #BuildHybridAI 2026 (Firebase AI Logic). Deadline: Nov 30, 2026, 22:00 GMT (2:00 PM PT).
Builder: solo developer, 14 days. Quality and finish over feature count.

Detailed design lives in `docs/` and wins over this file where they differ in detail:
- `docs/01-technical-design.md`: structure, router, task->mode table, data model, state machine
- `docs/02-prompts-and-schemas.md`: the six prompts, zod schemas, lead template
- `docs/03-plan.md`: day-by-day plan, exit tests, cut list
- `docs/04-design-system.md`: colours, type, spacing, components, copy rules

Facts about Firebase AI Logic, Chrome and the rules below were checked on Nov 16, 2026.

## One-line pitch
"The cloud does the thinking, the device keeps the secrets."
Run a multi-agent war game on your most confidential plan (startup, pricing war,
match tactics, bet, corporate move) without your secrets ever leaving your device.

## Lead demo
Startup Idea Stress Test: the user's real startup idea vs. a skeptical VC,
a copycat competitor, and the market. Other templates shown briefly:
Price War (commodity market), Match War Game (football tactics).

## Judging criteria (official: four, equally weighted, each scored 1-5)
1. Technological Implementation: how well it is built and how effectively it uses
   Firebase AI Logic hybrid inference. -> clear, smart on-device/cloud split, visible in the UI.
2. Design: a complete, coherent product experience, not a technical proof of concept.
3. Potential Impact: a credible, specific case for a real problem and a real audience.
   -> confidential planning, where hybrid beats cloud-only on privacy + cost + latency.
4. Quality of the Idea: a creative, non-obvious use of Firebase AI Logic.
Ties are broken in the order listed. Multi-platform (Web app + Chrome extension from one
codebase) is "preferred" by the rules, not a criterion; there is a separate Best Web/Chrome prize.
Criteria 3 and 4 are judged largely from the text description and the video.

## Hard requirements (non-negotiable)
- $0 total cost, no credit card, no billing account. Firebase stays on the Spark plan. Use only
  free-tier services and models that need no billing (gemini-4-hydrogen, gemini-3.8-flash,
  gemini-3.5-flash-lite). Never add Blaze, Cloud Functions, paid APIs, cloud VMs, trials that
  ask for a card, or billing-only models (gemini-4-argon, gemini-4-carbon). If a feature has no
  free path, cut it.
- All AI runs through Firebase AI Logic (firebase/ai), using hybrid inference. Four modes exist:
  InferenceMode.PREFER_ON_DEVICE / ONLY_ON_DEVICE / PREFER_IN_CLOUD / ONLY_IN_CLOUD.
  No other model API is called directly. The repo must show firebase/ai imported AND called.
- Firebase App Check is REQUIRED: enforcement is mandatory for AI Logic since Nov 2, 2026, so
  no cloud call works without it. Web provider: reCAPTCHA Enterprise. Use
  `useLimitedUseAppCheckTokens: true` (JS SDK >= 12.14.0). Debug tokens are accepted by the
  rules for dev and for the extension. Never allowlist localhost in reCAPTCHA.
- Also use: Firebase Auth (anonymous everywhere; Google sign-in on web only), Firestore,
  Remote Config, Hosting.
- Public GitHub repo with an Apache-2.0 LICENSE file that GitHub detects (shown in About),
  setup instructions in README.
- App is free. Hosted URL works for judges whose devices can't run on-device AI.
- Submission: demo video <= 3:00, public on YouTube, in English; text description covering
  how Firebase AI Logic is used, features, value proposition, and a summary of what was built
  during the submission period (Nov 11-30). Commits after the deadline are not evaluated.

## Architecture: 4 layers
1. PRIVACY FIREWALL (on-device, Gemini Nano, ONLY_ON_DEVICE)
   - Input: the user's raw confidential text. This means the brief AND every move the user
     types in later rounds.
   - Gemini Nano only EXTRACTS names (company, person, product, place, other) as JSON.
     Regex finds money, percentages, numbers, dates, emails, URLs, phones. Code then does the
     substitution. The model never rewrites the text.
   - Result: abstracted text + placeholder map,
     e.g. "Acme" -> [COMPANY_1], "$2.4M ARR" -> [MONEY_1], "Casablanca" -> [PLACE_1].
   - The placeholder map and all raw text are stored ONLY locally (IndexedDB `vault` store).
     Never sent to cloud, never written to Firestore.
   - User reviews the abstracted brief (diff view: red = removed, green = placeholder)
     and approves before anything goes to the cloud. Moves get an inline "N items masked" strip.
   - EGRESS GUARD: before any call that can reach the cloud and before any Firestore write,
     scan the outgoing text for vaulted originals; block on a hit. An inspector drawer shows
     the exact text of every cloud call.
   - FALLBACK when on-device model is unavailable: deterministic redaction
     (regex for numbers, money, emails, URLs, capitalized entities + user-editable list),
     clearly labeled "Basic redaction (on-device AI unavailable)". NEVER silently
     send the raw brief to the cloud.
2. THE GENERALS (cloud, ONLY_IN_CLOUD, default model `gemini-3.5-flash-lite` since Day 2 because
   `gemini-4-hydrogen` free-tier capacity is saturated; hydrogen is one Remote Config edit away)
   - 3 heavy agents with distinct personas, goals and hidden info
     (lead template: Skeptical VC, Copycat Competitor, The Market).
   - Turn-based rounds (default 3): user move -> each General responds in parallel with a
     headline, move, rationale, threat level (1-5) and the assumption it targets.
     Agents see only the abstracted brief + compacted history.
3. THE CROWD (PREFER_ON_DEVICE, cloud fallback `gemini-3.5-flash-lite`)
   - 10 lightweight personas (customers, fans, investors...); each round 5 of them, rotating,
     give 1-2 sentence reactions + a sentiment score (-2..+2). One batched call per round,
     on-device or cloud (measured 19 Nov: one warm on-device call is ~17 s on the dev machine,
     so per-persona calls are too slow). Never blocks the next round.
4. THE REFEREE
   - `referee_round` (PREFER_ON_DEVICE, cloud fallback `gemini-3.5-flash-lite`): after each
     round, summary, score delta per General, contradiction detection vs earlier commitments.
   - `referee_live` (ONLY_ON_DEVICE): feedback while the user types their move (debounced).
     It sees raw text, so it has no cloud route; hidden when on-device AI is unavailable.
   - FINAL REPORT (cloud, `gemini-4-hydrogen`, falls back to `gemini-3.5-flash-lite`): verdict, top 3 risks, top 3 counter-strategies,
     next steps.
   - Re-hydration: the device swaps placeholders back to real names locally at render time.
     Stored games are always abstracted.

## Routing layer (core of the hybrid story)
- Single module `ai/router.ts`: `run(task, input)` where task ∈
  {redact, crowd, referee_live, referee_round, general_move, final_report}.
- Routing table lives in Remote Config as one JSON parameter `routing_table`
  (mode + model name per task), with compiled defaults.
- PRIVACY LOCK: `redact` and `referee_live` see raw text and are forced to ONLY_ON_DEVICE in
  code. Remote Config and URL overrides cannot change that. Reason: PREFER_ON_DEVICE falls
  back to the cloud silently, including while the model is still downloading.
- Every AI result returns {output, source: "on-device" | "cloud", latencyMs, model, fallback,
  repaired}. `source` is read from `response.inferenceSource`, never inferred from the mode.
- UI shows a badge on every AI output: 🔒 On-device / ☁️ Cloud + latency.
- "Hybrid stats" panel: % calls on-device, cloud calls avoided, data kept local. Built from our
  own call ledger (Firebase console AI monitoring shows nothing for on-device calls).
- Dev override: ?forceCloud=1 / ?forceDevice=1 / ?mock=1 for testing.
  ?forceCloud=1 makes raw tasks behave as "on-device unavailable"; it never sends raw text out.

## Tech stack
- TypeScript, Vite, React, Tailwind. pnpm monorepo:
  packages/core (router, prompts, schemas, firewall, game engine, no React)
  packages/ui (shared React screens and components, Tailwind preset)
  apps/web (PWA, Firebase Hosting)
  apps/extension (Chrome MV3, side panel UI, mounts the same App; anonymous auth only)
- zod 4 for validating every JSON response; one automatic repair retry on invalid JSON.
  One zod schema per task also produces the on-device responseConstraint and the cloud
  responseSchema. Schema rules: all fields required, no null/optional/unions; "none" is "" or [].
- Firestore stores ONLY abstracted war games (opt-in "Save to cloud"); local-first by default.
- Offline: replay finished games and re-run Referee/Crowd "what-if" tweaks locally.
- No custom backend or Cloud Functions.

## Design direction
Retro-Tactical Terminal, full spec in `docs/04-design-system.md` (wins over anything here).
- 60-30-10: Carbon Charcoal #121413 background, Matte Olive-Gray #1C211E surfaces, Off-White
  #E5E7EB text, Dark Moss #2D3630 hairlines, Phosphor Mint #10B981 (live, on-device) and Radar
  Orange #F97316 (stress points) as the only accents.
- Golden ratio: 16 px base type scale x1.618, Fibonacci spacing, 61.8/38.2 layout split.
- JetBrains Mono + Inter, bundled from npm (offline). No emoji. No hex literals in components.
- NO em dash or en dash anywhere on screen; render-time cleanPunctuation() on all AI text.
- Responsive down to phone and side-panel width; phones get the cloud path with basic
  redaction (Chrome on Android/iOS has no Gemini Nano).

## Constraints to respect
- Gemini Nano on-device, via Firebase AI Logic: single-turn only (no chat sessions), about
  9,216 tokens, no tools, no countTokens in hybrid mode, not available in Web Workers,
  languages en/ja/es/de/fr. Keep on-device prompts short, single-purpose, JSON-only.
  The router is stateless; history is compacted into each prompt; budget inputs by characters.
- Nano needs desktop Chrome (Windows 10/11, macOS 13+, Linux, Chromebook Plus), 22 GB free
  disk, and >4 GB VRAM or 16 GB RAM with 4+ cores. Prompt API is stable in extensions since
  Chrome 138; for web pages, detect availability at runtime and explain, never assume.
- Model download must start from a user gesture; show progress. ONLY_ON_DEVICE waits for the
  download, so check availability first and never wait inside the router.
- On-device may be slow on weak hardware: stream outputs, show progress, never block UI.
- Do not hardcode model names outside the compiled defaults; read from Remote Config.
  Current IDs (Nov 2026): gemini-4-hydrogen, gemini-4-argon and gemini-4-carbon (both need
  billing), gemini-3.8-flash, gemini-3.5-flash-lite. The 2.5 family is being rerouted.
- MV3 extension: signInWithPopup and reCAPTCHA cannot run in extension pages. Use
  `firebase/auth/web-extension` with anonymous sign-in; App Check via a hosted bridge page or
  a debug token (see docs/01 §7). Run all AI in the side panel page, not the service worker.
- Keep secrets out of the repo (.env.example only). That includes App Check debug tokens.

## Version control (applies to every agent and tool working in this repo)
- Repo: https://github.com/Apex1s/War-Room (public, Apache-2.0). Work on `main`.
- Commits are authored by the repo owner only. Do NOT add `Co-Authored-By:` trailers,
  "Generated with ..." lines, tool signatures or any other AI attribution to commit
  messages, PR descriptions, code comments or the README. This applies to Antigravity,
  Claude and any other assistant.
- Commit messages: one imperative summary line under 72 characters, optional body saying why.
- Small commits, one concern each. Run typecheck and tests before committing.
- Never commit `.env`, App Check debug tokens, service-account files or build output.
  Check `git status` before every commit.
- Never force-push, rewrite history or change git config.
- `packages/core/prompts/` and `packages/core/src/ai/schemas.ts` are read-only for agents
  unless the owner says otherwise: prompt text and schema field names must change together.

## Definition of done
Live URL + extension loadable unpacked + README + LICENSE + 3-min demo where:
the user pastes a confidential brief -> firewall redacts it on-device -> 3 rounds of war game
-> crowd + referee run on-device -> final report from cloud -> real names re-hydrated locally
-> network off: replay + what-if still work.
