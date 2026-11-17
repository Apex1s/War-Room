# War Room — 14-Day Plan

Mon 16 Nov → Sun 29 Nov are build days. Mon 30 Nov is buffer only. Deadline: 30 Nov, 22:00 GMT (2:00 PM PT).

Ordering rule: anything that could invalidate the design is tested in the first two days, on throwaway code. The full demo path works end to end, ugly, by the end of Day 7. Features freeze at the end of Day 12.

Each day has an exit test. If it fails, fix it or cut from the list at the bottom before starting the next day.

---

## Week 1: prove the risky parts, then get to end-to-end

### Day 1, Mon 16 — Hybrid inference spike

The whole project rests on this day. All code is throwaway, in `spike/`.

- First hour: in Chrome DevTools run `await LanguageModel.availability()`. Check free disk (22 GB) and GPU/RAM. **If this machine cannot run Nano, stop and solve that first**: another machine, or more disk.
- Create the Firebase project. Enable AI Logic (Gemini Developer API), App Check with reCAPTCHA Enterprise, anonymous Auth, Remote Config, Hosting. Register a debug token for local dev.
- Create the public GitHub repo with the Apache-2.0 `LICENSE` and confirm GitHub shows the license in About.
- One page, three buttons, each printing output, `inferenceSource` and latency:
  1. `ONLY_ON_DEVICE` with `responseConstraint` from `deviceSchema('crowd')`
  2. `PREFER_ON_DEVICE` with the same prompt
  3. `ONLY_IN_CLOUD` on `gemini-4-hydrogen` with `cloudSchema('general_move')`
- Download progress via the SDK from a button click.
- Deploy the spike to Hosting and load it in a **clean Chrome profile** without the debug token, so reCAPTCHA Enterprise is really exercised and you learn whether the Prompt API needs a flag on stable.
- Turn the network off and press button 1 again.
- Optional: submit the Quota Form before Wed 18 Nov 10:00 PT if you want `gemini-4-carbon` for the report.

**Exit test:** all three buttons return valid JSON on the hosted URL, and you have written down the answers to the VERIFY items in the design doc (option names, integer bounds on-device, plain-object cloud schema, offline behaviour, flag needed or not).

### Day 2, Tue 17 — Monorepo, router, extension spike

Day 1 result: cloud path, App Check and the privacy refusal all pass on the hosted URL. Two things failed and come first today (design doc §9 items 1 and 8, §10).

- **First, a Nano-capable machine (owner, not Antigravity).** In order, stop at the first that reaches `'available'`:
  1. On this laptop, `chrome://flags/#optimization-guide-on-device-model` → "Enabled BypassPerfRequirement", relaunch, check `chrome://on-device-internals`, then `await LanguageModel.availability()`. With 8 GB RAM it may still refuse or be too slow; treat a yes as good enough for development only.
  2. A friend's or university machine with 16 GB RAM + 4 cores or a GPU with more than 4 GB, for testing and the video.
  3. A rented cloud desktop (Windows, 16 GB RAM, 4+ vCPU) driven over remote desktop.
  If none works by tonight, the on-device half is shown only through the mock provider and the demo story changes. Decide tonight, not later.
- **Second, the latency matrix** in the spike (design doc §10): `general_move` on `gemini-4-hydrogen` at MINIMAL/LOW/MEDIUM and `gemini-3.8-flash` at MINIMAL/LOW, plus `generateContentStream` time-to-first-chunk. Write the numbers into `spike/FINDINGS.md` and set the defaults in `routing-table.ts` from them.
- Scaffold the pnpm workspace: `packages/core`, `packages/ui`, `apps/web`, `apps/extension`. Vitest in core.
- `router.ts`, `tasks.ts`, `schemas.ts`, `json.ts`, `ledger.ts`, `provider-firebase.ts`, `provider-mock.ts`, `routing-table.ts` with Remote Config and the three URL overrides.
- Unit tests with the mock provider: privacy clamp, repair retry, invalid JSON twice, abort, and a raw task with `globalThis.LanguageModel` deleted (must throw `device_unavailable` with no provider call).
- Extension spike, **three-hour limit**: side panel renders, `LanguageModel.availability()` works there, one cloud call succeeds with App Check. Try the bridge first; fall back to the debug token.

**Exit test:** you know which machine runs Nano; a General's move streams its first text within a few seconds and finishes under 20 s; `run('crowd', …)` and `run('general_move', …)` return typed results with the right `source` from a scratch page; `?forceCloud=1` flips the crowd badge; you know which App Check plan the extension uses.

### Day 3, Wed 18 — Firewall core

- `detectors.ts`, `chunk.ts`, `placeholders.ts`, `firewall.ts`, `egress-guard.ts`, `net-guard.ts` (fetch wrapper, design doc §4).
- The `redact` prompt on Nano. Write five sample briefs (the startup demo brief plus four others) and hand-label the names.
- Unit tests: round trip `rehydrate(applyMap(text)) === text`; overlapping entities; a name inside another name; egress guard blocks a planted leak.
- Deterministic fallback path, and the same tests run with the device "unavailable".

**Exit test:** the demo brief is sealed on-device with no missed names after one pass, and the fallback path produces a usable abstraction of the same brief.

### Day 4, Thu 19 — Firewall UI and local storage

- Design tokens and Tailwind preset: colours, type scale, card, badge. Decide the accent colour now.
- Screens: Home (template picker), Brief (objective + plan), FirewallReview (diff view, placeholder table, approve).
- `DeviceStatus` component: unavailable, downloadable with a button, downloading with progress, ready.
- `local-db.ts` with the `games`, `vault`, `ledger` and `settings` stores.

**Exit test:** paste the brief, watch it seal, toggle one entry off and add one by selecting text, approve, reload the page and land back on the same state.

### Day 5, Fri 20 — Game engine and the Generals

- `machine.ts`, `engine.ts`, `compact.ts`, `scoring.ts`, `templates/startup.ts`.
- Reducer tests for every transition including `failed` and `RETRY`.
- `general_move` running for three rounds from a plain debug page that prints the transcript.
- Read ten full transcripts. Tune the General prompt until moves are actions, tokens stay intact, and a good counter lowers the threat.

**Exit test:** three rounds complete from the debug page against the real cloud model, with all three Generals replying in parallel and no token broken.

### Day 6, Sat 21 — Crowd and Referee on-device

- `crowd`, `referee_round`, `referee_live` wired into the engine.
- Measure Nano latency for ten sequential crowd calls. If the wall takes more than about 40 seconds, set `batchOnDevice` to 5 and re-test quality.
- Planted-contradiction tests for both referee prompts.
- Move sealing: known entities replaced, new entities shown as chips.

**Exit test:** a round's aftermath completes on-device with the network tab showing zero requests for crowd and referee, and `NEXT` works while the crowd is still running.

### Day 7, Sun 22 — War room UI, report, re-hydration

- WarRoom screen: round timeline, agent cards, crowd wall, referee panel, move composer with live coaching, `SourceBadge` on every AI output.
- `final_report` and the Report screen, with real names swapped back in at render time and the "What your opponents knew" reveal.

**Milestone, end of Day 7:** the full definition-of-done path runs in the web app: paste brief → sealed on-device → three rounds → crowd and referee on-device → report from the cloud → real names shown. It can look rough. If this milestone slips past Monday midday, apply the cut list in order until it is met.

---

## Week 2: complete the product, then the deliverables

### Day 8, Mon 23 — Replay, offline, hybrid stats

- Replay from a finished `GameRecord`. PWA shell with `vite-plugin-pwa`.
- What-if: edit a past move, re-run crowd and referee with `only_on_device`.
- `HybridStats` panel and `EgressInspector` drawer from the ledger.

**Exit test:** with the network off, open a finished game, change a move, and get new crowd and referee output.

### Day 9, Tue 24 — Auth, Firestore, Remote Config, production deploy

- Anonymous sign-in at start; "Sign in with Google" via `linkWithPopup`.
- Opt-in "Save to cloud", Firestore rules, load on another browser.
- Remote Config template checked into the repo; `onConfigUpdate` clears the router cache.
- Deploy with App Check enforced and replay protection on. Set a budget alert.

**Exit test:** on the hosted URL in a clean profile, play a full game with `?forceCloud=1`, save it, and flip `crowd` to cloud from the Remote Config console while watching the badges change.

### Day 10, Wed 25 — Chrome extension

- Side panel mounting `<App platform={extensionPlatform} />`, anonymous auth, the App Check plan chosen on Day 2.
- Context menu "Stress-test selection in War Room" that prefills the brief.
- Layout pass at side-panel width (about 400 px), which also covers the mobile layout.
- Quota Form sprint 3 closes today 10:00 PT, if still wanted.

**Exit test:** load unpacked from a fresh build, select text on a page, and finish a full game in the side panel.

### Day 11, Thu 26 — Two more templates, design pass

- `price-war.ts` and `match.ts`: three Generals and ten crowd personas each. Data only, no new code paths.
- Design pass on every screen: spacing, empty states, loading and streaming states, error states with retry, focus order.

**Exit test:** each template completes one full game; no screen shows a raw spinner or an unstyled error.

### Day 12, Fri 27 — Hardening, then feature freeze

- The judge matrix: (a) Nano available, (b) clean profile without Nano, (c) `?forceCloud=1`, (d) offline replay, (e) extension, (f) phone-width layout.
- Failure drills: kill the network mid-round; return invalid JSON twice from the mock; hit the rate limit by running three games back to back.
- Final prompt tuning from the transcripts collected this week.
- **Feature freeze at end of day.** After this, only bug fixes.

**Exit test:** all six matrix cells pass twice in a row.

### Day 13, Sat 28 — Written deliverables and recording

- README: what it is, the hybrid table, architecture diagram, setup from a fresh clone, how to load the extension, App Check notes, license.
- Devpost text: how Firebase AI Logic is used, features, value proposition, and the required summary of what was built during the submission period.
- Demo script to the second, then record. Record more takes than you think you need.

**Exit test:** a fresh clone on a clean directory builds and runs by following the README only.

### Day 14, Sun 29 — Video, final deploy, submit a draft

- Edit to under 3:00, add captions, upload to YouTube as public.
- Final deploy. Tag the release. Attach the built extension zip if Plan A (no embedded token) is in use.
- Fill in the Devpost form completely and **submit on Sunday night**. It can still be edited until the deadline.

### Mon 30 Nov — Buffer

Nothing is planned. Re-check the hosted URL, the video link and the repo from a logged-out browser. Final edits in by 18:00 GMT, four hours ahead of the deadline. No commits after submission are evaluated.

---

## Cut list

Cut in this order when a day's exit test fails and cannot be fixed within two hours.

1. What-if edits. Keep read-only offline replay.
2. Magnitude hints for money and numbers.
3. Match War Game template. Two templates are enough to show breadth.
4. `referee_live` coaching while typing.
5. Extension context menu. The extension becomes the side panel alone.
6. Google sign-in and cloud save. Anonymous and local-only, with Firestore mentioned as future work. This weakens the "supported Firebase products" line, so it is last.

Never cut: the firewall with its review screen, the labelled basic-redaction fallback, the source badges, the hybrid stats panel, the final report with re-hydration, the hosted URL working without Nano.

## Scope I am already declining

- A fourth General. Three run in parallel, fit on one row and are enough for the video.
- Google sign-in inside the extension. It needs an offscreen document and a hosted relay page for a feature nobody will see in the demo.
- Mobile-specific features. Phones cannot run Nano in Chrome; they get a correct layout and the cloud path.
- Public share links for games.
- Any custom backend or Cloud Functions. The rules want inference through Firebase AI Logic, and the design needs nothing server-side.

## Demo video skeleton (for Day 13)

| Time | Shot |
|---|---|
| 0:00–0:20 | The problem: you cannot paste your real plan into a cloud model. One line, one screen. |
| 0:20–0:55 | Paste the brief. Firewall seals it on-device. Diff view. Open the egress inspector: this is all the cloud will ever see. |
| 0:55–1:50 | Round 1 and 2: Generals from the cloud, crowd wall filling in on-device, referee verdict, badges and latency visible. Live coaching while typing a move. |
| 1:50–2:15 | Final report with real names back. Hybrid stats panel: calls on-device, cloud calls avoided. |
| 2:15–2:35 | Flip Remote Config in the console; badges change live. Then network off: replay and what-if still work. |
| 2:35–2:55 | Same app in the Chrome side panel, started from selected text. Price War template for two seconds. |
| 2:55–3:00 | The line: the cloud does the thinking, the device keeps the secrets. URL. |
