# War Room — Technical Design

Status: v1, 16 Nov 2026. Source of truth for structure, router, data model and game loop.
Prompts and schemas are in [02-prompts-and-schemas.md](02-prompts-and-schemas.md); the schedule is in [03-plan.md](03-plan.md).

Items marked **VERIFY** come from the docs but I could not confirm the exact identifier from the SDK typings. Check them against `node_modules/firebase/ai` on Day 1 before building on them.

---

## 0. What the current docs change in the brief

Checked 16 Nov 2026 against the Firebase AI Logic docs, the Chrome Prompt API docs and the official hackathon rules.

| # | Brief says | Current reality | Consequence |
|---|---|---|---|
| 1 | "Gemini Pro/Flash", "Flash-Lite" | No current stable "Pro". Lineup: `gemini-4-hydrogen` (fast, high-intelligence, no billing), `gemini-4-argon` and `gemini-4-carbon` (billing required), `gemini-3.8-flash`, `gemini-3.5-flash-lite`. The 2.5 family is being rerouted on 1 Dec. | Defaults: Generals and report on `gemini-4-hydrogen`, cloud fallbacks on `gemini-3.5-flash-lite`. All in Remote Config. |
| 2 | Three inference modes | Four: `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`. | Router `Mode` type has four values. |
| 3 | Router computes `source` | SDK reports it: `result.response.inferenceSource` is `ON_DEVICE` or `IN_CLOUD` (JS SDK ≥ 12.5.0). | Router reads it; never infers it from the mode. |
| 4 | App Check "integrated" | **Enforcement is mandatory for AI Logic since 2 Nov 2026.** Web provider is reCAPTCHA Enterprise only. Replay protection via `useLimitedUseAppCheckTokens: true` (SDK ≥ 12.14.0). Rules say debug tokens are acceptable. Do not allowlist `localhost` in reCAPTCHA. | App Check is Day 1 work, not polish. Nothing in the cloud works without it. |
| 5 | On-device is "small context" | Hard limits: single-turn only (no chat sessions), about 9,216 tokens, no tools, no `countTokens` in hybrid, text or text+image in, JSON structured output supported. | Router is stateless. History is compacted into each prompt. Budget by characters. |
| 6 | "Fallback when unavailable" | `PREFER_ON_DEVICE` falls back to cloud **silently while the model is still downloading**, not only when unsupported. `ONLY_ON_DEVICE` waits for the download. | Any task that sees raw text must be `ONLY_ON_DEVICE`, locked in code. See §3. |
| 7 | "Mobile-responsive" | Nano runs on desktop Chrome only (Windows 10/11, macOS 13+, Linux, Chromebook Plus). Needs 22 GB free disk and either >4 GB VRAM or 16 GB RAM with 4+ cores. No Android or iOS Chrome. | Mobile gets the cloud path plus basic redaction. Layout only, no mobile-specific features. |
| 8 | Chrome flag setup | Prompt API is stable in **extensions** since Chrome 138. For **web pages** it is listed as shipping in Chrome 148, but the Firebase guide still tells you to enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`. | Test on a clean Chrome profile on Day 1. The app must detect and explain, never assume. |
| 9 | (not mentioned) | Prompt API is unavailable in Web Workers. On-device languages: en, ja, es, de, fr. Firebase console AI monitoring shows nothing for on-device calls. | Router runs on the main thread. Arabic briefs get basic redaction. The Hybrid stats panel is instrumented by us. |
| 10 | Google sign-in everywhere | `signInWithPopup` does not work in an MV3 extension without an offscreen document. Anonymous sign-in works directly via `firebase/auth/web-extension`. | Extension is anonymous-only. Google sign-in is web-only. |
| 11 | Judging criteria in priority order | Official: four **equally weighted** criteria scored 1–5: Technological Implementation, Design, Potential Impact, Quality of the Idea. Multi-platform is "preferred", not a criterion. There is a separate $3k Best Web/Chrome prize. | Two of four criteria are judged from the text and the video. Reserve two full days for them. |
| 12 | Deliverables | Video ≤ 3 min, public on YouTube, English. License must be detectable in the repo's About section. Repo must show `firebase/ai` imported **and called**. A "what I built during the submission period" summary is required. No secrets in repo. | Create the public repo with `LICENSE` on Day 1. |

Also from the rules: billing-required models can be requested through a Quota Form. Next request deadlines are **Wed 18 Nov 10:00 PT** and Wed 25 Nov 10:00 PT. Only relevant if you want `gemini-4-carbon` for the final report; the design does not depend on it.

Deadline confirmed: 30 Nov 2026, 2:00 PM PT = 22:00 GMT.

---

## 1. Folder structure

```
WarRoom/
├─ AGENTS.md
├─ LICENSE                          Apache-2.0
├─ README.md
├─ package.json  pnpm-workspace.yaml  tsconfig.base.json
├─ .env.example                     VITE_FIREBASE_*, VITE_RECAPTCHA_SITE_KEY, VITE_APPCHECK_DEBUG_TOKEN
├─ firebase.json  firestore.rules  remoteconfig.template.json
├─ docs/
├─ packages/
│  ├─ core/                         no React; firebase only inside firebase/ and ai/provider-firebase.ts
│  │  ├─ prompts/                   the six agent prompts; dependency-free, one file per task
│  │  │  ├─ index.ts                PROMPTS registry: { system(input), user(input), target } per task
│  │  │  ├─ types.ts                PromptInput, GeneralSpec, CrowdPersona, PromptRound, LIMITS
│  │  │  ├─ redact.ts  crowd.ts  referee-live.ts  referee-round.ts      on-device prompts
│  │  │  ├─ general-move.ts  final-report.ts                            cloud prompts
│  │  │  └─ repair.ts               the one-shot JSON repair prompt
│  │  └─ src/
│  │     ├─ ai/
│  │     │  ├─ router.ts            run(task, input): the ONLY entry point for AI
│  │     │  ├─ tasks.ts             TaskSpec registry: pairs each prompt from ../../prompts with its schema, privacy class, normalize
│  │     │  ├─ schemas.ts           zod output schemas, deviceSchema(), cloudSchema()
│  │     │  ├─ routing-table.ts     zod schema, defaults, Remote Config parsing, URL overrides
│  │     │  ├─ provider.ts          ModelProvider interface
│  │     │  ├─ provider-firebase.ts firebase/ai implementation
│  │     │  ├─ provider-mock.ts     canned outputs for tests and ?mock=1
│  │     │  ├─ json.ts              extract, parse, validate, one repair retry
│  │     │  ├─ device.ts            availability, download progress, status store
│  │     │  ├─ egress-guard.ts      blocks any cloud-bound text containing a vaulted original
│  │     │  └─ ledger.ts            AiCallRecord log, hybrid stats selectors
│  │     ├─ firewall/
│  │     │  ├─ detectors.ts         regex: money, percent, number, date, email, URL, phone, capitalised runs
│  │     │  ├─ chunk.ts             paragraph-aware chunking for Nano
│  │     │  ├─ placeholders.ts      buildMap(), applyMap(), rehydrate()
│  │     │  └─ firewall.ts          seal(text, existingMap) -> SealResult
│  │     ├─ game/
│  │     │  ├─ types.ts
│  │     │  ├─ machine.ts           pure reducer (state, event) -> state
│  │     │  ├─ engine.ts            effects: calls the router, dispatches events
│  │     │  ├─ compact.ts           history compaction for prompts
│  │     │  ├─ scoring.ts
│  │     │  └─ templates/           startup.ts, price-war.ts, match.ts (data only)
│  │     ├─ storage/
│  │     │  ├─ local-db.ts          IndexedDB via idb
│  │     │  └─ cloud-sync.ts        Firestore save/load; accepts CloudGame only
│  │     ├─ firebase/init.ts        app, App Check, auth, ai, Remote Config; takes a Platform
│  │     └─ index.ts
│  └─ ui/                           shared React + Tailwind preset
│     └─ src/
│        ├─ App.tsx                 <App platform={...} />
│        ├─ screens/                Home, Brief, FirewallReview, WarRoom, Report, Replay
│        ├─ components/             AgentCard, SourceBadge, DiffView, PlaceholderTable, RoundTimeline,
│        │                          CrowdWall, RefereePanel, MoveComposer, HybridStats, EgressInspector,
│        │                          DeviceStatus
│        └─ hooks/                  useGame, useDeviceStatus, useLedger
└─ apps/
   ├─ web/                          Vite + vite-plugin-pwa, Firebase Hosting
   └─ extension/                    Vite + @crxjs/vite-plugin, MV3
      ├─ manifest.config.ts         side_panel, contextMenus, storage; fixed "key" for a stable ID
      ├─ sidepanel.html / .tsx      mounts the same <App />
      └─ background.ts              opens the side panel, context menu "Stress-test selection"
```

`Platform` is the only seam between web and extension:

```ts
export interface Platform {
  kind: 'web' | 'extension';
  authMode: 'anonymous+google' | 'anonymous';
  appCheckProvider: () => AppCheckProvider;        // reCAPTCHA Enterprise on web; see §7 for extension
  initialBrief?: () => Promise<string | null>;     // extension: text selected on the page
}
```

---

## 2. Router

### Types (`packages/core/src/ai/router.ts`)

```ts
export type Task =
  | 'redact' | 'crowd' | 'referee_live' | 'referee_round' | 'general_move' | 'final_report';

export type Mode = 'only_on_device' | 'prefer_on_device' | 'prefer_in_cloud' | 'only_in_cloud';
export type Source = 'on-device' | 'cloud';
export type Privacy = 'raw' | 'abstracted';

export interface AiResult<T> {
  output: T;
  source: Source;          // from response.inferenceSource
  latencyMs: number;
  task: Task;
  model: string;           // 'gemini-nano' or the cloud model id
  fallback: boolean;       // the preferred side was not the one that answered
  repaired: boolean;       // the JSON repair retry was needed
}

export interface RunOptions {
  signal?: AbortSignal;
  onText?: (partial: string) => void;   // streaming progress; text is partial JSON, show as activity only
  gameId?: string;                      // for the ledger and the egress guard
}

export type AiErrorCode =
  | 'device_unavailable' | 'cloud_unavailable' | 'invalid_json'
  | 'egress_blocked' | 'rate_limited' | 'aborted';

export class AiError extends Error {
  constructor(public code: AiErrorCode, public task: Task, message?: string) { super(message ?? code); }
}

export function run<K extends Task>(
  task: K, input: TaskInput[K], opts?: RunOptions,
): Promise<AiResult<TaskOutput[K]>>;
```

### TaskSpec (`tasks.ts`)

```ts
export interface TaskSpec<K extends Task> {
  privacy: Privacy;                         // hard-coded, NOT remote-configurable
  system: (input: TaskInput[K]) => string;  // static for device tasks
  user: (input: TaskInput[K]) => string;
  schema: z.ZodType<TaskOutput[K]>;
  normalize?: (out: TaskOutput[K], input: TaskInput[K]) => TaskOutput[K];  // clamp, drop unknown ids, truncate
  maxInputChars: number;                    // builder must respect; router asserts
}
```

### What `run` does, in order

1. Resolve the route: Remote Config table → URL override → **privacy clamp**. If `spec.privacy === 'raw'`, the mode is forced to `only_on_device` no matter what Remote Config or the URL says.
2. If the resolved mode is `only_on_device` and `device.status !== 'available'`, throw `device_unavailable` immediately. Callers of raw tasks catch this and use the deterministic path. Never wait on a download inside `run`.
3. If the mode can reach the cloud (anything except `only_on_device`), run `egressGuard.assertClean(system + user, gameId)`. A hit throws `egress_blocked`.
4. Get or create the model instance, cached by `task|mode|cloudModel|systemHash`. Config is fixed for the lifetime of a `GenerativeModel`, so a new Remote Config value means a new instance.
5. Call `generateContentStream`, forward chunks to `onText`, time it with `performance.now()`.
6. Read `inferenceSource`. Extract JSON, `safeParse`. On failure send the repair prompt once on the same model instance. Second failure throws `invalid_json`.
7. `normalize`, append an `AiCallRecord` to the ledger, return.

### Model construction (`provider-firebase.ts`)

```ts
import { getGenerativeModel, InferenceMode } from 'firebase/ai';

const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: {
    model: route.cloudModel,
    systemInstruction: system,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: cloudSchema(task),          // VERIFY: plain-object schema accepted; else build with Schema.*
      temperature: route.temperature,
      maxOutputTokens: route.maxOutputTokens,
    },
  },
  onDeviceParams: {
    createOptions: {
      initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    },
    promptOptions: { responseConstraint: deviceSchema(task) },   // VERIFY: exact option name
  },
});
```

Model download: `model.initializeDeviceModel(onProgress)` must be called from a user gesture (**VERIFY** name). `device.ts` wraps it and exposes `status: 'unknown' | 'unavailable' | 'downloadable' | 'downloading' | 'available'` plus `progress`.

### Dev overrides

| Param | Effect |
|---|---|
| `?forceCloud=1` | Abstracted tasks become `only_in_cloud`. Raw tasks behave as if the device model is unavailable (deterministic redaction, no live coaching). This is the "judge without Nano" path. |
| `?forceDevice=1` | `crowd` and `referee_round` become `only_on_device`. Generals and report stay in the cloud. |
| `?mock=1` | `provider-mock.ts`. No network, no quota. |

---

## 3. Task → mode table

Defaults. Everything except the Privacy column is overridable from Remote Config.

| Task | Sees | Privacy | Mode | Cloud model | If on-device is unavailable |
|---|---|---|---|---|---|
| `redact` | raw brief, raw moves | raw (locked) | `ONLY_ON_DEVICE` | none | Deterministic redaction, labelled "Basic redaction (on-device AI unavailable)" |
| `referee_live` | raw draft while typing | raw (locked) | `ONLY_ON_DEVICE` | none | Feature hidden with a one-line note |
| `crowd` | abstracted round | abstracted | `PREFER_ON_DEVICE` | `gemini-3.5-flash-lite` | Cloud, one batched call |
| `referee_round` | abstracted round | abstracted | `PREFER_ON_DEVICE` | `gemini-3.5-flash-lite` | Cloud |
| `general_move` | abstracted brief + history | abstracted | `ONLY_IN_CLOUD` | `gemini-4-hydrogen` | n/a |
| `final_report` | abstracted transcript | abstracted | `ONLY_IN_CLOUD` | `gemini-4-hydrogen` | n/a |

Why this split holds up under questioning:

- **Privacy** decides `redact` and `referee_live`. Raw text has no cloud route in code, so a bad Remote Config push cannot leak it.
- **Cost and latency** decide `crowd` (10 calls per round) and `referee_round`. They run on already-abstracted text, so cloud fallback is safe.
- **Capability** decides the Generals and the report. Nano is not good enough at adversarial reasoning over a long transcript.
- `referee_live` exists only because of on-device. Per-keystroke calls to the cloud would be costly and would send unredacted drafts.

### Remote Config

One JSON parameter, `routing_table`, parsed with zod. Invalid or missing falls back to compiled defaults. The last good value is cached in IndexedDB for offline starts.

```json
{
  "v": 1,
  "rounds": 3,
  "tasks": {
    "crowd":         { "mode": "prefer_on_device", "cloudModel": "gemini-3.5-flash-lite", "temperature": 0.9 },
    "referee_round": { "mode": "prefer_on_device", "cloudModel": "gemini-3.5-flash-lite", "temperature": 0.2 },
    "general_move":  { "mode": "only_in_cloud",    "cloudModel": "gemini-4-hydrogen",     "temperature": 0.8 },
    "final_report":  { "mode": "only_in_cloud",    "cloudModel": "gemini-4-hydrogen",     "temperature": 0.3 }
  },
  "crowd": { "personas": 10, "batchOnDevice": 1, "batchInCloud": 10 }
}
```

`redact` and `referee_live` are deliberately absent. `onConfigUpdate` → `activate` → router clears its model cache. Flipping `crowd` to `only_in_cloud` in the console changes the badges live, which is a good ten seconds of demo video.

---

## 4. Privacy firewall

Change from the brief: **Nano extracts entities; code does the substitution.** The model never rewrites the brief. This halves the output tokens, removes the risk of the model paraphrasing or dropping content, makes the placeholder map exact by construction, and gives the diff view for free (it is just a list of spans).

```
seal(text, existingMap):
  1. values  = detectors(text)                       regex: MONEY, PERCENT, NUMBER, DATE, EMAIL, URL, PHONE
  2. names   = device available
                 ? for each chunk (≤ 1,800 chars): run('redact', { text: chunk }).entities
                 : capitalisedRuns(text)             heuristic, minus a stop list and sentence-initial words
  3. names   = names.filter(e => text includes e.text exactly)      drops hallucinated spans
  4. custom  = user's always-redact list (settings)
  5. map     = merge(existingMap, values ∪ names ∪ custom)          longest match first, stable token numbering
  6. abstracted = applyMap(text, map)                               all occurrences, case-insensitive for names
  7. return { abstracted, map, spans, method: 'on-device-ai' | 'basic' }
```

```ts
export type EntityType =
  | 'COMPANY' | 'PERSON' | 'PRODUCT' | 'PLACE' | 'OTHER'          // from Nano or heuristic
  | 'MONEY' | 'PERCENT' | 'NUMBER' | 'DATE' | 'CONTACT';          // from regex

export interface PlaceholderEntry {
  token: string;            // "[COMPANY_1]"
  type: EntityType;
  original: string;         // "Acme"
  aliases: string[];        // "ACME", "Acme Inc."
  detectedBy: 'ai' | 'regex' | 'user';
  enabled: boolean;         // user can un-redact in review
  hint?: string;            // optional magnitude shared with the cloud, e.g. "$1M–$5M" (stretch)
}
```

Rules:

- **User moves go through the firewall too.** The brief is not the only raw input: every move the user types can name real things. On submit, `seal(move, game.map)` runs. Known entities are replaced deterministically; new ones appear as chips above the composer ("2 new items masked") with undo. No full review screen for moves.
- **Review screen** shows original on the left (red on removed spans), abstracted on the right (green on tokens), and the placeholder table below. The user can toggle an entry, add a term by selecting text, or rename a type. "Approve and send" is the only way forward.
- **Egress guard** (`egress-guard.ts`): before any call that can reach the cloud, and before any Firestore write, scan the outgoing text for every enabled `original` and alias (normalised, length ≥ 3). A hit blocks the call. This is the backstop for firewall bugs and for the user typing a vaulted name into a later move.
- **Egress inspector**: a drawer listing the exact text of every cloud call for this game, read from the ledger. It lets a judge check the privacy claim without opening DevTools.
- **Re-hydration** is a pure view function, `rehydrate(text, map)`, applied at render time. The stored game is always abstracted. It tolerates tokens the cloud model returned without brackets.
- **Stretch, cut first:** magnitude hints. Money and numbers lose meaning as bare tokens. A legend line per entry ("MONEY_1: between $1M and $5M") lets the Generals reason about scale. Deterministic bucketing, user toggle per entry.

---

## 5. Data model

### Local: IndexedDB `warroom`, version 1 (via `idb`)

| Store | Key | Contents | Leaves device? |
|---|---|---|---|
| `games` | `id` | `GameRecord`: abstracted only | Only on "Save to cloud" |
| `vault` | `gameId` | `VaultRecord`: raw brief, raw moves, placeholder map | **Never** |
| `ledger` | auto, index `gameId` | `AiCallRecord` per AI call | Never |
| `settings` | string | always-redact list, last good routing table, UI prefs | Never |

```ts
export interface GameRecord {
  id: string;
  schemaVersion: 1;
  templateId: 'startup' | 'price-war' | 'match';
  objective: string;                 // abstracted, one line
  brief: string;                     // abstracted
  redactionMethod: 'on-device-ai' | 'basic';
  generals: GeneralSpec[];
  crowd: CrowdPersona[];
  totalRounds: number;
  rounds: RoundRecord[];
  commitments: string[];
  report: (FinalReportOutput & AiMeta) | null;
  phase: Phase;
  whatIfs: WhatIfRecord[];
  createdAt: number; updatedAt: number;
  cloudSavedAt: number | null;
}

export interface RoundRecord {
  n: number;
  userMove: string;                                  // abstracted
  generalMoves: (GeneralMoveOutput & AiMeta & { generalId: string })[];
  crowd: (CrowdReaction & AiMeta)[];
  referee: (RefereeRoundOutput & AiMeta) | null;
}

export interface AiMeta { source: Source; latencyMs: number; model: string; fallback: boolean }

export interface VaultRecord {
  gameId: string;
  rawObjective: string;
  rawBrief: string;
  rawMoves: Record<number, string>;
  map: PlaceholderEntry[];
}

export interface AiCallRecord {
  gameId: string | null; task: Task; source: Source; model: string;
  latencyMs: number; inChars: number; outChars: number;
  fallback: boolean; repaired: boolean; ts: number;
  cloudPayload?: string;             // only when source === 'cloud'; feeds the egress inspector
}
```

The compiler enforces the boundary: `cloud-sync.ts` imports `GameRecord` and never `VaultRecord`, and `local-db.ts` exposes the vault through a separate `vault` object that `cloud-sync.ts` does not import. Add one unit test that fails if `cloud-sync.ts` imports from the vault module.

Hybrid stats are selectors over the ledger: on-device call share, cloud calls avoided (on-device calls that had a cloud route), characters kept local (`rawBrief.length` plus on-device `inChars`), median latency per source.

### Firestore (opt-in only)

```
users/{uid}/games/{gameId}      CloudGame = Omit<GameRecord, 'phase' | 'whatIfs'> & { ownerUid: string }
```

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/games/{gameId} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.ownerUid == uid
        && request.resource.data.schemaVersion == 1
        && !request.resource.data.keys().hasAny(['map', 'rawBrief', 'rawMoves', 'rawObjective', 'vault']);
    }
  }
}
```

Anonymous users upgrade with `linkWithPopup(GoogleAuthProvider)`, so the uid and their saved games are kept. The egress guard runs on `JSON.stringify(cloudGame)` before every write.

---

## 6. Game loop state machine

Pure reducer in `machine.ts`, effects in `engine.ts`. No state-machine library. State is persisted to IndexedDB after every transition, so a reload resumes in place.

```ts
export type Phase =
  | { kind: 'draft' }
  | { kind: 'sealing_brief'; progress: number }             // firewall running
  | { kind: 'review' }                                      // user approves the abstracted brief
  | { kind: 'user_turn'; round: number }
  | { kind: 'sealing_move'; round: number }
  | { kind: 'generals'; round: number; pending: string[] }  // general ids still thinking
  | { kind: 'aftermath'; round: number; referee: 'running' | 'done' | 'skipped'; crowd: 'running' | 'done' }
  | { kind: 'reporting' }
  | { kind: 'done' }
  | { kind: 'failed'; at: Phase; code: AiErrorCode };       // RETRY returns to `at`

export type GameEvent =
  | { type: 'BRIEF_SUBMITTED'; objective: string; brief: string; templateId: string }
  | { type: 'SEAL_PROGRESS'; progress: number }
  | { type: 'BRIEF_SEALED'; result: SealResult }
  | { type: 'MAP_EDITED'; map: PlaceholderEntry[] }
  | { type: 'REDACTION_APPROVED' }
  | { type: 'MOVE_SUBMITTED'; text: string }
  | { type: 'MOVE_SEALED'; abstracted: string; newEntries: PlaceholderEntry[] }
  | { type: 'GENERAL_MOVED'; generalId: string; result: AiResult<GeneralMoveOutput> }
  | { type: 'CROWD_REACTED'; result: AiResult<CrowdOutput> }
  | { type: 'CROWD_FINISHED' }
  | { type: 'REFEREE_RULED'; result: AiResult<RefereeRoundOutput> }
  | { type: 'NEXT' }
  | { type: 'REPORT_READY'; result: AiResult<FinalReportOutput> }
  | { type: 'FAILED'; code: AiErrorCode }
  | { type: 'RETRY' };
```

```
draft ──BRIEF_SUBMITTED──▶ sealing_brief ──BRIEF_SEALED──▶ review ──REDACTION_APPROVED──▶ user_turn(1)
                                                             ▲ MAP_EDITED (stays)

user_turn(n) ──MOVE_SUBMITTED──▶ sealing_move(n) ──MOVE_SEALED──▶ generals(n)
generals(n)  ──GENERAL_MOVED (last pending)──▶ aftermath(n)
aftermath(n) ──NEXT [referee ≠ running, n < N]──▶ user_turn(n+1)
aftermath(n) ──NEXT [referee ≠ running, n = N]──▶ reporting ──REPORT_READY──▶ done

any async phase ──FAILED──▶ failed{at} ──RETRY──▶ at
```

Engine behaviour per phase:

| Phase | Effects | Blocking? |
|---|---|---|
| `sealing_brief` | `firewall.seal(objective + brief)`, chunk by chunk, with progress | Yes, with progress |
| `sealing_move` | `firewall.seal(move, map)`; usually under a second because most entities are already known | Yes |
| `generals` | One `general_move` per General, **in parallel**. Each sees the history up to the previous round and the current user move, not the other Generals' current replies. Cards fill in as each returns. One failed General can be retried alone. | Yes |
| `aftermath` | `referee_round` and the crowd start together. Crowd runs `ceil(personas / batch)` calls sequentially and dispatches `CROWD_REACTED` per call, so the wall fills in live. | Referee blocks `NEXT`. Crowd does not; pressing `NEXT` aborts the remaining crowd calls. |
| `user_turn` | `referee_live` on the draft: debounce 800 ms, minimum 40 chars, abort the previous call, cache by text hash | Never |
| `reporting` | `final_report` with streaming progress | Yes |

Decisions worth knowing:

- Round 1's move is prefilled per template ("Launch as described in the brief") and editable, so the first round starts with one click.
- If the referee fails twice, the round continues with `referee: 'skipped'` and scores carried over. A referee failure must not end a game.
- Score per General is the running sum of the referee's `delta`, range −6 to +6 over three rounds. `threatLevel` comes from the General and is displayed separately.
- Prompt history compaction (`compact.ts`): a General gets its own past moves in full and the other Generals' headlines only. Nano tasks get headlines only.
- **Replay** is the same UI rendered from a `GameRecord` with `phase.kind === 'done'`. **What-if**: in replay, edit a past move, then re-run `crowd` and `referee_round` with `only_on_device` against the recorded General replies. Results are stored in `whatIfs`, labelled "Generals' replies are from the original game". Works with the network off.

---

## 7. Chrome extension

Side panel that mounts the same `<App />`. Everything AI runs in the side panel page, not the service worker. The background script only opens the panel and adds the context menu item, which writes the selected text to `chrome.storage.session` for `platform.initialBrief()`.

The Prompt API has been stable in extensions since Chrome 138 with no flag, so the extension is where on-device is most likely to work for a judge.

The open problem is App Check: reCAPTCHA Enterprise loads remote code, which MV3 extension pages cannot do, and enforcement is mandatory. Two options, to be decided in a three-hour spike on Day 2:

- **Plan A, bridge.** A hidden iframe in the side panel loads `https://<hosting>/appcheck-bridge.html`. That page runs App Check with reCAPTCHA Enterprise and answers `postMessage` requests with a token, after checking `event.origin` is `chrome-extension://<fixed id>`. The extension uses `new CustomProvider({ getToken })`.
- **Plan B, debug token.** `self.FIREBASE_APPCHECK_DEBUG_TOKEN` from `.env` at build time. The rules explicitly accept this. The token stays out of the repo, and the README tells a judge how to register their own.

If Plan A is not working after three hours, take Plan B and move on.

---

## 8. Firebase initialisation order (`firebase/init.ts`)

```ts
const app = initializeApp(config);
if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
initializeAppCheck(app, { provider: platform.appCheckProvider(), isTokenAutoRefreshEnabled: true });
const auth = getAuth(app);                    // 'firebase/auth/web-extension' in the extension build
await signInAnonymously(auth);                // only if no current user
const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
const rc = getRemoteConfig(app);              // defaults = compiled routing table; fetchAndActivate; onConfigUpdate
```

`GoogleAIBackend` (Gemini Developer API) keeps the project on the free tier. Set a budget alert anyway before the URL goes public.

---

## 9. Open risks, in the order they get tested

1. **Your own machine may not run Nano.** 22 GB free disk and >4 GB VRAM or 16 GB RAM. If `LanguageModel.availability()` returns `unavailable` on Day 1, the demo cannot be recorded on this machine and the plan changes that day.
2. Whether a web page on stable Chrome gets the Prompt API without a flag (table row 8).
3. `responseConstraint` passing through the Firebase SDK, and whether integer `minimum`/`maximum` are honoured on-device. Fallback: drop the bounds from the device schema and clamp in `normalize`.
4. Plain-object `responseSchema` in the cloud. Fallback: hand-build the six schemas with `Schema.object(...)`.
5. On-device calls with the network off. The definition of done requires what-if to work offline, and it is not documented whether the SDK needs a network round trip (App Check, config) before an on-device call.
6. Nano latency: ten sequential crowd calls must finish in a watchable time. Fallback: `batchOnDevice: 5`.
7. Nano recall on entity extraction. Measure on five sample briefs on Day 3. The review screen and the egress guard are the safety net either way.
8. Free-tier rate limits on `gemini-4-hydrogen` during judging. A full game for a judge without Nano is about 16 cloud calls.
9. App Check in the extension (§7).
