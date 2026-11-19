# War Room — Technical Design

Status: v1.1, 17 Nov 2026. Source of truth for structure, router, data model and game loop.
Prompts and schemas are in [02-prompts-and-schemas.md](02-prompts-and-schemas.md); the schedule is in [03-plan.md](03-plan.md).

The v1 **VERIFY** items were checked on Day 1 against `firebase@13.3.0` / `@firebase/ai@3.1.0` and the hosted spike. Results are in §10 and [spike/FINDINGS.md](../spike/FINDINGS.md); the sections below already reflect them.

---

## 0. What the current docs change in the brief

Checked 16 Nov 2026 against the Firebase AI Logic docs, the Chrome Prompt API docs and the official hackathon rules.

| # | Brief says | Current reality | Consequence |
|---|---|---|---|
| 1 | "Gemini Pro/Flash", "Flash-Lite" | No current stable "Pro". Lineup: `gemini-4-hydrogen` (fast, high-intelligence, no billing), `gemini-4-argon` and `gemini-4-carbon` (billing required), `gemini-3.8-flash`, `gemini-3.5-flash-lite`. The 2.5 family is being rerouted on 1 Dec. | Defaults (after Day 2, §10): Generals on `gemini-3.5-flash-lite`, final report on `gemini-4-hydrogen`, every cloud route falls back to flash-lite. All in Remote Config. |
| 2 | Three inference modes | Four: `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`. | Router `Mode` type has four values. |
| 3 | Router computes `source` | SDK reports it: `result.response.inferenceSource` is `InferenceSource.ON_DEVICE` (`'on_device'`) or `InferenceSource.IN_CLOUD` (`'in_cloud'`) (JS SDK ≥ 12.5.0). | Router reads it and maps it to `'on-device'` / `'cloud'`; never infers it from the mode. |
| 4 | App Check "integrated" | **Enforcement is mandatory for AI Logic since 2 Nov 2026.** Web provider is reCAPTCHA Enterprise only. Replay protection via `useLimitedUseAppCheckTokens: true` (SDK ≥ 12.14.0). Rules say debug tokens are acceptable. Do not allowlist `localhost` in reCAPTCHA. | App Check is Day 1 work, not polish. Nothing in the cloud works without it. |
| 5 | On-device is "small context" | Hard limits: single-turn only (no chat sessions), about 9,216 tokens, no tools, no `countTokens` in hybrid, text or text+image in, JSON structured output supported. | Router is stateless. History is compacted into each prompt. Budget by characters. |
| 6 | "Fallback when unavailable" | `PREFER_ON_DEVICE` falls back to cloud **silently while the model is still downloading**, not only when unsupported. `ONLY_ON_DEVICE` waits for the download. | Any task that sees raw text must be `ONLY_ON_DEVICE`, locked in code. See §3. |
| 7 | "Mobile-responsive" | Nano runs on desktop Chrome only (Windows 10/11, macOS 13+, Linux, Chromebook Plus). Needs 22 GB free disk and either >4 GB VRAM or 16 GB RAM with 4+ cores. No Android or iOS Chrome. | Mobile gets the cloud path plus basic redaction. Layout only, no mobile-specific features. |
| 8 | Chrome flag setup | Prompt API is stable in **extensions** since Chrome 138. For **web pages** it is listed as shipping in Chrome 148, but the Firebase guide still tells you to enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`. | Test on a clean Chrome profile on Day 1. The app must detect and explain, never assume. |
| 9 | (not mentioned) | Prompt API is unavailable in Web Workers. On-device languages: en, ja, es, de, fr. Firebase console AI monitoring shows nothing for on-device calls. | Router runs on the main thread. Arabic briefs get basic redaction. The Hybrid stats panel is instrumented by us. |
| 10 | Google sign-in everywhere | `signInWithPopup` does not work in an MV3 extension without an offscreen document. Anonymous sign-in works directly via `firebase/auth/web-extension`. | Extension is anonymous-only. Google sign-in is web-only. |
| 11 | Judging criteria in priority order | Official: four **equally weighted** criteria scored 1–5: Technological Implementation, Design, Potential Impact, Quality of the Idea. Multi-platform is "preferred", not a criterion. There is a separate $3k Best Web/Chrome prize. | Two of four criteria are judged from the text and the video. Reserve two full days for them. |
| 12 | Deliverables | Video ≤ 3 min, public on YouTube, English. License must be detectable in the repo's About section. Repo must show `firebase/ai` imported **and called**. A "what I built during the submission period" summary is required. No secrets in repo. | Create the public repo with `LICENSE` on Day 1. |

The project is $0 with no credit card (AGENTS.md). Billing-only models (`gemini-4-argon`, `gemini-4-carbon`) and the rules' Quota Form for them are out of scope; the design does not depend on them.

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
2. If the resolved mode is `only_on_device` and either `globalThis.LanguageModel` is undefined or `device.status !== 'available'`, throw `device_unavailable` immediately, before any model is built. Callers of raw tasks catch this and use the deterministic path. Never wait on a download inside `run`. **This check is the privacy lock, not an optimisation:** when `LanguageModel` is undefined (Firefox, Safari, mobile Chrome, desktop Chrome without the Prompt API), the SDK builds no Chrome adapter and sends even an `ONLY_ON_DEVICE` request to the cloud on `gemini-3.5-flash-lite` (FINDINGS §2.1). Unit-test it with `LanguageModel` deleted from the global.
3. If the mode can reach the cloud (anything except `only_on_device`), run `egressGuard.assertClean(system + user, gameId)`. A hit throws `egress_blocked`.
4. Get or create the model instance, cached by `task|mode|cloudModel|systemHash`. Config is fixed for the lifetime of a `GenerativeModel`, so a new Remote Config value means a new instance.
5. Call `generateContentStream`, forward chunks to `onText`, time it with `performance.now()`. Cloud calls use the route's `timeoutMs` via `RequestOptions` (SDK default is 180 s). A timeout throws `cloud_unavailable`.
6. Read `inferenceSource`. Extract JSON, `safeParse`. On failure send the repair prompt once on the same model instance. Second failure throws `invalid_json`.
7. `normalize`, append an `AiCallRecord` to the ledger, return.

### Model construction (`provider-firebase.ts`)

```ts
import { getGenerativeModel, InferenceMode, type SchemaRequest } from 'firebase/ai';

const model = getGenerativeModel(
  ai,
  {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: route.cloudModel,
      systemInstruction: system,                    // the cloud side takes the system prompt here
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: cloudSchema(task) as SchemaRequest,   // plain object accepted (verified)
        thinkingConfig: { thinkingLevel: route.thinkingLevel }, // not temperature: ignored on Gemini 3.x+
        maxOutputTokens: route.maxOutputTokens,
      },
    },
    onDeviceParams: {
      createOptions: {
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],  // and the device side here
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: { responseConstraint: deviceSchema(task) },   // name verified
    },
  },
  { timeout: route.timeoutMs },
);
```

Model download: `model.initializeDeviceModel(onProgress)` (verified; `progress` is 0..1) must be called from a user gesture. With `LanguageModel` present but `'unavailable'` it throws `AI/api-not-enabled`. `device.ts` wraps it and exposes `status: 'unknown' | 'unavailable' | 'downloadable' | 'downloading' | 'available'` plus `progress`.

Do not pass `temperature`, `topP` or `topK`: the typings mark them ignored on Gemini 3.x and later. `presencePenalty` and `frequencyPenalty` return HTTP 400.

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
    "crowd":         { "mode": "prefer_on_device", "cloudModel": "gemini-3.5-flash-lite", "fallbackModel": "gemini-3.8-flash",      "deviceLastResort": false, "timeoutMs": 20000 },
    "referee_round": { "mode": "prefer_on_device", "cloudModel": "gemini-3.5-flash-lite", "fallbackModel": "gemini-3.8-flash",      "deviceLastResort": false, "timeoutMs": 20000 },
    "general_move":  { "mode": "only_in_cloud",    "cloudModel": "gemini-3.5-flash-lite", "fallbackModel": "gemini-3.8-flash",      "deviceLastResort": true,  "timeoutMs": 25000 },
    "final_report":  { "mode": "only_in_cloud",    "cloudModel": "gemini-4-hydrogen",     "fallbackModel": "gemini-3.5-flash-lite", "deviceLastResort": false, "thinkingLevel": "LOW", "timeoutMs": 90000 }
  },
  "crowd": { "personas": 10, "perRound": 5, "batchOnDevice": 5, "batchInCloud": 5 }
}
```

Defaults set from the Day 2 measurements (§10).

**Retry policy (updated 19 Nov after an end-to-end test).** `AI/parse-failed` is usually Google's server breaking off a streamed reply mid-way with a 500 "high demand" JSON body appended to the SSE stream; the SDK cannot parse it. Order for a cloud call: (1) on 500/503, `parse-failed` or timeout, retry the **same** model once after about 2 s; on 429, wait `retryDelay` if it is 20 s or less, then retry the same model once; (2) then `fallbackModel`; (3) then Nano when `deviceLastResort`. Jumping straight to `gemini-3.8-flash` failed every time on 19 Nov because it is saturated too. Attach a `.catch` to `streamResult.response` before iterating the stream, or a mid-stream error surfaces twice, once as an unhandled rejection. `thinkingLevel` is optional; when absent no `thinkingConfig` is sent. `fallbackModel` gets one retry on HTTP 429/500/503, timeout or `AI/parse-failed`, in `prefer_in_cloud` mode when `deviceLastResort` is true (§10, decision 3). `thinkingLevel` applies to the primary model only. `redact` and `referee_live` are deliberately absent. `onConfigUpdate` → `activate` → router clears its model cache. Flipping `crowd` to `only_in_cloud` in the console changes the badges live, which is a good ten seconds of demo video.

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
- **Network guard** (`net-guard.ts`), the second backstop: on start-up, wrap `window.fetch` once. Any request to `firebasevertexai.googleapis.com` or `firestore.googleapis.com` whose body contains a vaulted original, or a raw text currently being sealed (registered by `seal()` for the duration of the call), is rejected before it leaves the page and logged as `egress_blocked`. It exists because the SDK can route an `ONLY_ON_DEVICE` call to the cloud (§2 step 2). About 30 lines; it is also a strong ten seconds of the demo video (plant a leak, watch it get stopped).
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
await authStateReady(auth);
if (!auth.currentUser) await signInAnonymously(auth).catch(() => {});  // offline start must not block on-device AI
const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
const rc = getRemoteConfig(app);              // defaults = compiled routing table; fetchAndActivate; onConfigUpdate
```

`GoogleAIBackend` (Gemini Developer API) keeps the project on the free tier. The project stays on the Spark plan with no billing account, so nothing can be charged; free-tier rate limits are the ceiling instead (§9 item 9).

---

## 9. Open risks, in the order they get tested

Status after Day 1 in brackets.

1. [RESOLVED 19 Nov] Dev machine and Nano. After a RAM upgrade to 11.8 GB (still under the official 16 GB) and `chrome://flags/#optimization-guide-on-device-model` = "Enabled BypassPerfRequirement", `availability()` is `'available'` and the spike's ONLY_ON_DEVICE call returns `inferenceSource: 'on_device'` with schema-valid JSON. First call after download: 204 s (cold). Warm latency decides crowd batching (item 6). The README must say the demo machine uses the bypass flag and that Google's official requirement is 16 GB RAM or a GPU with more than 4 GB VRAM.
2. [OPEN] Whether a web page on stable Chrome gets the Prompt API without a flag. `LanguageModel` was defined on the hosted page with no flag in Chrome 156/157; whether it reaches `'available'` needs capable hardware.
3. [DONE] `responseConstraint` name verified. Integer bounds accepted by the typings; still unmeasured on a real Nano. `normalize` clamps regardless.
4. [DONE] Plain-object `responseSchema` works in the cloud (button 3 returned schema-valid JSON on the hosted URL).
5. [PARTLY] On-device with the network off: by code reading, the on-device path makes no App Check, Auth or network call. Not yet run on real hardware.
6. [MEASURED 19 Nov] Nano latency on the dev machine (11.8 GB, CPU path, bypass flag), one crowd persona: 204 s first call after download; 122 s warm with the old schema (Nano padded the array to 12 invented personas); with the per-call schema (`crowdDeviceSchema`, exact length, enum ids) 40 s first call after a reload and **16.7 s warm**. Output length dominates on CPU. Decisions: crowd shows 5 rotating personas per round in ONE batched call (`perRound: 5`, `batchOnDevice: 5`); every array in a device schema is exact-length where the count is known (crowd, referee scores); a background warm-up prompt runs when the device becomes ready. Expect a 5-persona call and a referee call at roughly 25–45 s each, running in the background while the player writes the next move. Measure both on Day 6.
7. [OPEN] Nano recall on entity extraction (Day 3).
8. [MITIGATED] `gemini-4-hydrogen` latency and free-tier capacity: 144 s on Day 1, then only 500s and timeouts on Day 2. Generals moved to flash-lite with a fallback chain (§10). Re-probe hydrogen daily.
9. **[MEASURED 17 Nov, high] Free-tier rate limit: `gemini-3.5-flash-lite` allows 15 requests per minute per project**, shared by every visitor of the hosted app (429 `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, with a `retryDelay` in the error). A cloud-only game is about 16 calls in 3–5 minutes, so roughly three judges playing at once saturate it; on-device crowd and referee cut a game to about 7 cloud calls. Mitigations: on 429, read `retryDelay` and, if it is 20 s or less, show "Cloud is busy, retrying in N s" and retry the same model once before the fallback chain; never retry in a tight loop; keep crowd and referee on-device wherever Nano exists. Each model has its own per-model quota, so the fallback model adds headroom only when it is not saturated.
10. [OPEN] App Check in the extension (§7).

---

## 10. Day 1 spike results (hosted URL, 17 Nov 2026)

`firebase@13.3.0`, `@firebase/ai@3.1.0`, production build on Firebase Hosting, reCAPTCHA Enterprise (no debug token), on a machine where Nano is `'unavailable'`.

| Check | Result |
|---|---|
| App Check, production | reCAPTCHA Enterprise exchange 200. With `useLimitedUseAppCheckTokens` a fresh token is exchanged per AI call (~170–210 ms added per call). |
| Anonymous Auth | Works; UID issued. |
| Button 1, `ONLY_ON_DEVICE`, device unavailable | Throws `AI/api-not-enabled`. **Zero network requests.** |
| Button 2, `PREFER_ON_DEVICE`, device unavailable | Fell back to `gemini-3.5-flash-lite`, `inferenceSource: 'in_cloud'`, 2.4 s end to end (1.9 s model), schema-valid. |
| Button 3, `ONLY_IN_CLOUD`, `gemini-4-hydrogen` | `in_cloud`, schema-valid, high quality (in character, kept every placeholder, ended on a pointed question). **144 s**, reproduced twice (one run still pending at 100 s). No `thinkingConfig` set. |
| Debug token in production bundle | Absent (checked against the built `dist`). |
| On-device paths, offline | Not run: no capable hardware. |

Day 2 latency matrix (one `general_move`, same input, record model latency and whether the output still reads well):

| Model | thinkingLevel |
|---|---|
| `gemini-4-hydrogen` | MINIMAL, LOW, MEDIUM |
| `gemini-3.8-flash` | MINIMAL, LOW |

Target: a General's move in under 20 s with streaming visible from the first second. Pick the cheapest row that keeps the quality; the final report may use a higher level because it runs once.

### Day 2 results (17 Nov, spike FINDINGS §3 plus a second diagnosis run)

| Model | Setting | Result |
|---|---|---|
| `gemini-4-hydrogen` | MINIMAL | HTTP 400: level not supported |
| `gemini-4-hydrogen` | LOW, MEDIUM | HTTP 500 "high demand" after 6–38 s, or no first chunk before the 60 s timeout. 0 successes in 6 tries |
| `gemini-3.8-flash` | MINIMAL | HTTP 400: level not supported |
| `gemini-3.8-flash` | LOW | HTTP 500 "high demand" or timeout. 0 successes in 5 tries |
| `gemini-3.5-flash-lite` | none, MINIMAL, LOW | 6 of 8 valid, 2–10 s total. 2 failures were `AI/parse-failed` mid-stream (transient; retry worked) |

Reading: the 4-series and 3.8 free-tier capacity is saturated, not slow by design. Hydrogen with thinking streams nothing until it has finished thinking, so streaming does not help perceived latency on it. Flash-lite's move was schema-valid and usable but flatter than hydrogen's, and it **invented a `[COMPANY_2]` token** that was not in the brief.

Decisions:

1. **`general_move` defaults to `gemini-3.5-flash-lite`** with no `thinkingLevel`. Hydrogen stays one Remote Config edit away; re-probe it each morning and flip when it answers under 20 s. Switching the Generals' model live from the console is itself demo material.
2. **`final_report` defaults to `gemini-4-hydrogen` LOW, 90 s timeout**, falling back to flash-lite. It runs once, behind a progress screen.
3. **Backup chain, all inside Firebase AI Logic and all $0.** Each cloud route has `fallbackModel` and `deviceLastResort`. On HTTP 429/500/503, timeout or `AI/parse-failed`, the router retries **once** on `fallbackModel` (a different model has its own free quota and capacity pool). That retry runs in `prefer_in_cloud` mode when `deviceLastResort` is true, so if the second model also fails with a fetch error the SDK itself answers with Gemini Nano (`errorsCausingFallback` = `FETCH_ERROR`, `ERROR`, `API_NOT_ENABLED`, checked in `@firebase/ai@3.1.0`). Order: cloud model A → cloud model B → on-device Nano. `AiResult.model` and `source` say who answered; `fallback` is true. This puts all four inference modes to a real use, and a General answering with a 🔒 badge while the cloud is down is a strong demo moment.
   - `general_move`: `gemini-3.5-flash-lite` → `gemini-3.8-flash` → Nano (`deviceLastResort: true`; the prompt is ~1k tokens, well inside Nano's budget).
   - `final_report`: `gemini-4-hydrogen` → `gemini-3.5-flash-lite`, `deviceLastResort: false` (the full transcript can exceed Nano's ~9k tokens).
   - `crowd`, `referee_round`: on-device first already; cloud `gemini-3.5-flash-lite` → `gemini-3.8-flash`.
   - **Not allowed:** DeepSeek, OpenRouter or any other model API. The rules and AGENTS.md require all AI through `firebase/ai`, DeepSeek's API is pay-per-token, and sending even abstracted text to a third party weakens the privacy story.
4. **`thinkingLevel` is optional.** Omit `thinkingConfig` entirely when unset. `MINIMAL` is only valid on flash-lite.
5. **Invented tokens:** prompts now tell the model to describe untokenised things in plain words. Code backstop: `rehydrate` only swaps tokens that were present in the prompt sent; any other `[TYPE_N]` renders as a neutral phrase ("a company") and is logged in the ledger.
