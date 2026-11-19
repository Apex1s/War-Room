# Devpost submission text (draft)

Paste each section into the matching Devpost field. Lines starting with FILL need a number from the owner's test game before submitting. Keep the wording free of em and en dashes.

---

## Project name

War Room

## Tagline (one line)

The cloud does the thinking, the device keeps the secrets: an AI war game for plans too confidential to paste into a chatbot.

## Inspiration

Every founder, product lead and coach has a plan they would love to pressure-test before committing to it, and the more it matters, the less they can share it. Pasting an unannounced launch, a price cut or a team sheet into a cloud chatbot means handing over the secret. On-device models keep the secret but are too small to argue like a seasoned investor.

We wanted the best of both: cloud-grade opponents that never see the real names.

## What it does

You paste a confidential brief: a startup plan, a pricing move in a contested market, or a football match plan. War Room then:

1. **Seals it on your device.** Gemini Nano, running in Chrome through Firebase AI Logic, finds the company names, people, products and places. Regular expressions catch money, percentages, dates, numbers, emails and links. Code swaps each one for a placeholder such as `[COMPANY_1]` or `[MONEY_2]`. You see the original and the masked version side by side and approve before anything leaves.
2. **Runs a three-round war game.** Three cloud "Generals" with their own goals and hidden information attack your plan: for a startup, a skeptical VC, a copycat competitor and the market itself. Each round you answer with a move, which is sealed on-device the same way.
3. **Lets the crowd and the referee react locally.** Five rotating personas give quick reactions and a sentiment score, and a referee scores the round and flags any move that contradicts an earlier commitment. Both run on Gemini Nano when it is available.
4. **Delivers a verdict.** A final report names the top three risks, three counter-strategies and concrete next steps, then reveals what each opponent secretly knew.
5. **Puts your real names back, locally.** The cloud only ever saw placeholders. Your device restores the real names on screen.

Finished games can be replayed, and with the network off you can change a past move and get a new crowd and referee verdict on-device.

War Room ships as a web app and as a Chrome extension side panel from the same codebase. Select text on any page, right-click "Stress-test selection in War Room", and the brief is pre-filled.

## How we built it (how Firebase AI Logic is used)

Firebase AI Logic is the only way War Room talks to a model, and the hybrid split is the core of the product, not a feature on the side.

- **One router, six tasks, all four inference modes.** `run(task, input)` routes each task by a routing table:
  - `redact` and live coaching see raw text, so they are `ONLY_ON_DEVICE` and locked in code. No configuration can give them a cloud route.
  - Crowd and referee are `PREFER_ON_DEVICE` with a cloud fallback, because they are frequent, short and see only masked text.
  - The Generals and the final report are `ONLY_IN_CLOUD` because they need adversarial reasoning over a long context. If the cloud fails, a retry runs in `PREFER_IN_CLOUD` so the SDK itself can answer with Gemini Nano.
- **The source is read, not guessed.** Every result records `response.inferenceSource`, latency and model, and the UI badges every output "ON-DEVICE" or "CLOUD". A local call ledger feeds a Hybrid telemetry panel (share of calls on-device, cloud calls avoided, characters kept local), because the Firebase console cannot see on-device calls.
- **One schema, two worlds.** Each task has one zod schema that produces both Chrome's `responseConstraint` for Gemini Nano and the cloud `responseSchema`, and validates every reply, with one automatic repair retry.
- **Remote Config drives the routing.** The whole table (mode, model, fallback model, timeout per task) is a single JSON parameter. Flip the crowd to the cloud in the console and the badges change live, with no redeploy.
- **App Check everywhere**, with reCAPTCHA Enterprise and limited-use tokens. The Chrome extension, where reCAPTCHA cannot run, gets its tokens from a small bridge page on Firebase Hosting.
- **Auth, Firestore, Hosting:** anonymous sign-in everywhere and Google sign-in on the web; opt-in "Save to cloud" stores masked games only, enforced by Firestore rules and a client-side scan before every write.

Everything runs on the free Spark plan with the Gemini Developer API.

Stack: TypeScript, React, Tailwind CSS, Vite, a pnpm monorepo (core engine, shared UI, web app, MV3 extension), Vitest.

## Challenges we ran into

- **The SDK can route an `ONLY_ON_DEVICE` call to the cloud.** When `window.LanguageModel` does not exist (Firefox, Safari, phones), the SDK skips the device adapter and sends the request to the cloud. We found it in the SDK source on day one and made the router check for Gemini Nano itself before any raw-text task, then added a second guard around `fetch` that blocks any request containing a vaulted original.
- **On-device speed.** On our 11.8 GB laptop, one crowd reaction first took 122 seconds. Gemini Nano was filling the response with invented personas up to the schema's maximum. Constraining each call's schema to exactly the requested personas cut it to 16.7 seconds warm. We now batch five personas per round and warm the model up as soon as it is ready.
- **A busy free tier.** At peak, about half of the cloud calls failed with "high demand" errors, sometimes halfway through a streamed answer. The router retries the same model with backoff, then a second model, then Gemini Nano, and a General that still cannot answer simply "holds position" for that round instead of blocking the game.
- **Placeholders that mean something.** A bare `[MONEY_1]` tells an investor nothing. We pass coarse ranges ("between $100K and $500K") so the opponents can reason about scale while the real figure stays on the device.

## Accomplishments that we're proud of

- A privacy design you can verify: the Egress inspector shows the exact text of every cloud call, and none of them ever contains a real name.
- A game that keeps going when the cloud does not.
- One codebase that runs as a web app, a phone-friendly site and a Chrome side panel.
- The "What your opponents knew" reveal at the end, which turns a report into a story.

## What we learned

- Output length dominates on-device latency, so schemas are a performance tool, not just a validation tool.
- Hybrid is not "on-device first, cloud second". It is deciding, task by task, what each side should be allowed to see.
- Reading `inferenceSource` beats trusting the configured mode.

## What's next for War Room

- More scenario templates (negotiations, elections, fundraising).
- Team mode: share a masked game with co-founders while each person keeps their own vault.
- Sharper opponents as larger free models become available, switched on through Remote Config.

## Built during the submission period

All code was written between 16 and 30 November 2026. In order: the hybrid inference spike that verified the SDK behaviour; the router with privacy lock, retries and fallback chain; the privacy firewall with both egress guards; the game engine and the three Generals; on-device crowd and referee; the War Room and report screens; replay, offline what-if and hybrid telemetry; Auth, Firestore, Remote Config and Hosting; the Chrome extension; the Retro-Tactical Terminal design system; and the Price War and Match templates. The public commit history shows every step.

## Try it

- Live app: https://war-room-hybrid.web.app
- Code: https://github.com/Apex1s/War-Room (Apache-2.0)
- Video: FILL: YouTube link

## Numbers to fill before submitting

- FILL: timings from a full game on the Gemini Nano laptop (sealing, crowd, referee, total).
- FILL: share of calls on-device and cloud calls avoided in that game, from the Hybrid telemetry panel.
- CHECK: the "Placeholders that mean something" challenge describes magnitude hints. Keep it only if that feature has shipped; otherwise delete the bullet.
