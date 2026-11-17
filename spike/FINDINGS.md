# Day 1 Spike — Findings (`firebase@13.3.0` / `@firebase/ai@3.1.0`)

Checked against `spike/node_modules/@firebase/ai` (`@firebase/ai@3.1.0`, `firebase@13.3.0`) and `spike/node_modules/@firebase/app-check` on 16 Nov 2026.

---

## 1. Design Doc `VERIFY` Items

### 1.1 `inCloudParams.generationConfig.responseSchema` (Plain-Object Schema)
- **Design doc location:** `docs/01-technical-design.md` §2 (`provider-firebase.ts`), §9 item 4.
- **Finding:** **Confirmed — plain JS objects are accepted.**
- **SDK typing (`@firebase/ai/dist/esm/src/types/requests.d.ts`):**
  ```ts
  responseSchema?: TypedSchema | SchemaRequest;
  responseJsonSchema?: { [key: string]: unknown };
  ```
- **Details:**
  - `GenerationConfig.responseSchema` accepts either a `Schema.*` builder instance (`TypedSchema`) or a plain object matching `SchemaRequest` (OpenAPI 3.0 subset). At runtime (`index.esm.js` `validateGenerationConfig`), the SDK only checks that `responseMimeType` is `'application/json'` or `'text/x.enum'` and that `responseSchema` and `responseJsonSchema` are not set simultaneously; it then serialises `responseSchema` directly with `JSON.stringify`.
  - Additionally, `@firebase/ai@3.1.0` exposes `responseJsonSchema?: Record<string, unknown>`, which accepts standard JSON Schema directly.
  - Because `cloudSchema(task)` in `packages/core/src/ai/schemas.ts` is typed as returning `unknown`, callers passing it to `responseSchema` should cast it as `cloudSchema(task) as SchemaRequest` (imported from `'firebase/ai'`).

### 1.2 `onDeviceParams` and `promptOptions.responseConstraint`
- **Design doc location:** `docs/01-technical-design.md` §2 (`provider-firebase.ts`), §9 item 3.
- **Finding:** **Confirmed — exact option names match the design doc.**
- **SDK typing (`@firebase/ai/dist/esm/src/types/requests.d.ts` & `language-model.d.ts`):**
  ```ts
  export interface HybridParams {
    mode: InferenceMode;
    onDeviceParams?: OnDeviceParams;
    inCloudParams?: ModelParams;
  }

  export interface OnDeviceParams {
    createOptions?: LanguageModelCreateOptions;
    promptOptions?: LanguageModelPromptOptions;
  }

  export interface LanguageModelCreateOptions extends LanguageModelCreateCoreOptions {
    signal?: AbortSignal;
    initialPrompts?: LanguageModelMessage[];
    expectedInputs?: LanguageModelExpected[];
    expectedOutputs?: LanguageModelExpected[];
    monitor?: (monitor: LanguageModelDownloadMonitor) => void;
  }

  export interface LanguageModelPromptOptions {
    responseConstraint?: object;
  }
  ```
- **Details:**
  - `onDeviceParams.createOptions.initialPrompts` takes `LanguageModelMessage[]` where each entry is `{ role: 'system' | 'user' | 'assistant', content: [{ type: 'text' | 'image' | 'audio', value: string | ... }] }`.
  - `onDeviceParams.promptOptions.responseConstraint` is typed as `object | undefined` and is passed straight through to Chrome's `session.prompt(contents, this.onDeviceParams.promptOptions)` and `session.promptStreaming(contents, this.onDeviceParams.promptOptions)`.
  - On-device integer `minimum` / `maximum` bounds in `deviceSchema(task)` are accepted by `responseConstraint`; `TaskSpec.normalize` still clamps integer ranges (`sentiment` to `-2..2`, `clarity` to `1..5`, `delta` to `-2..2`) as a safeguard.

### 1.3 Model Download Method Name (`model.initializeDeviceModel`)
- **Design doc location:** `docs/01-technical-design.md` §2 (`provider-firebase.ts`).
- **Finding:** **Confirmed — exact method signature is `model.initializeDeviceModel(onDownloadProgress)`.**
- **SDK typing (`@firebase/ai/dist/esm/src/models/generative-model.d.ts`):**
  ```ts
  initializeDeviceModel(onDownloadProgress?: (progressValue: number) => void): Promise<void>;
  ```
- **Details:**
  - Must be triggered from a user gesture (button click or key press) when a download is needed.
  - `progressValue` is a number in `[0, 1]` read from the native `downloadprogress` event's `e.loaded`.
  - If `LanguageModel.availability()` is `'unavailable'` and `mode === InferenceMode.ONLY_ON_DEVICE`, `initializeDeviceModel` throws `AIError(AIErrorCode.API_NOT_ENABLED, 'Local LanguageModel API not available in this environment.')`.

---

## 2. Additional SDK & Runtime Findings

### 2.1 Critical Privacy Finding: `ONLY_ON_DEVICE` Fallback When `window.LanguageModel` is Undefined
- Inspecting `@firebase/ai/dist/esm/index.esm.js` (lines 1224–1231 and 2561–2567) revealed a critical edge case in the SDK:
  ```js
  function chromeAdapterFactory(mode, window, params) {
    const globalObj = window || getGlobal();
    const languageModel = globalObj.LanguageModel;
    if (languageModel && mode) {
      return new ChromeAdapterImpl(languageModel, mode, params);
    }
  }

  async function callCloudOrDevice(request, chromeAdapter, onDeviceCall, inCloudCall) {
    if (!chromeAdapter) {
      return {
        response: await inCloudCall(),
        inferenceSource: InferenceSource.IN_CLOUD
      };
    }
    // ...
  }
  ```
- When `window.LanguageModel` exists and `availability()` returns `'unavailable'`, `chromeAdapter` is instantiated and `ONLY_ON_DEVICE` throws `AIErrorCode.API_NOT_ENABLED` as documented.
- **However, when `window.LanguageModel` is `undefined`** (non-Chrome browser, mobile Chrome, or desktop Chrome without the Prompt API exposed), `chromeAdapterFactory` returns `undefined`. `callCloudOrDevice` then takes the `if (!chromeAdapter)` branch and **calls `inCloudCall()` even when `mode === InferenceMode.ONLY_ON_DEVICE`** (using `DEFAULT_HYBRID_IN_CLOUD_MODEL = 'gemini-3.5-flash-lite'`).
- **Consequence for War Room:** The router check in `docs/01-technical-design.md` §2 step 2 (`if (mode === 'only_on_device' && device.status !== 'available') throw new AiError('device_unavailable', task)`) is mandatory for privacy and must execute **before** calling `model.generateContent` / `model.generateContentStream`.

### 2.2 `InferenceMode` and `InferenceSource` Values
- `InferenceMode` enum values (`@firebase/ai/dist/esm/src/types/enums.d.ts`):
  - `InferenceMode.PREFER_ON_DEVICE === 'prefer_on_device'`
  - `InferenceMode.ONLY_ON_DEVICE === 'only_on_device'`
  - `InferenceMode.ONLY_IN_CLOUD === 'only_in_cloud'`
  - `InferenceMode.PREFER_IN_CLOUD === 'prefer_in_cloud'`
- `InferenceSource` enum values (`result.response.inferenceSource`):
  - `InferenceSource.ON_DEVICE === 'on_device'`
  - `InferenceSource.IN_CLOUD === 'in_cloud'`
  - Note the underscore in `'on_device'` and `'in_cloud'`. `provider-firebase.ts` should map `InferenceSource.ON_DEVICE` (`'on_device'`) to War Room's `Source` `'on-device'` and `'in_cloud'` to `'cloud'`.

### 2.3 Offline Behaviour (`ONLY_ON_DEVICE` With Network Off)
- **Design doc location:** `docs/01-technical-design.md` §9 item 5, `docs/03-plan.md` Day 1.
- **Finding:** **Confirmed — on-device inference makes zero network requests.**
- In `@firebase/ai/dist/esm/index.esm.js`:
  - `initApiSettings(ai)` only attaches lazy functions `getAppCheckToken` and `getAuthToken` to `_apiSettings`; it does not call them during `getAI` or `getGenerativeModel`.
  - When `callCloudOrDevice` dispatches to `onDeviceCall()`, it runs `chromeAdapter.generateContent(params)` / `chromeAdapter.generateContentStream(params)` locally via `window.LanguageModel` and wraps the output in a synthetic `Response`. `makeRequest()`, `getHeaders()`, App Check token exchange, and Auth token refresh are never invoked.
  - **Caveat for `firebase/init.ts`:** `await signInAnonymously(auth)` in `init.ts` must be wrapped in `try/catch` (or skipped if `!navigator.onLine` and no cached user) so an offline page reload does not reject before `getAI(app)` is called.

### 2.4 `GenerationConfig.temperature` Deprecation Notice on Gemini 3.x+
- In `@firebase/ai/dist/esm/src/types/requests.d.ts` (line 144):
  - `temperature`, `topP`, and `topK` are marked `@deprecated Not supported in Gemini 3.x and later models. The model will ignore this parameter if it's included in a request.`
  - Passing `temperature` does not throw an error (it is ignored by 3.x+ models), whereas `presencePenalty` and `frequencyPenalty` fail with HTTP 400.

### 2.5 Chrome Prompt API Flag & Hardware Check on Dev Machine
- **Chrome version installed:** `157.0.8103.51`.
- **Dev machine hardware:** Windows 10/11, 8 logical cores, 308 GB free disk on `C:`, 8 GB RAM (`TotalPhysicalMemory = 8,391,450,624`), Intel UHD Graphics 620 (`AdapterRAM = 1 GB`).
- **Consequence:** Because Chrome's on-device model requires >4 GB dedicated VRAM or ≥16 GB RAM with 4+ cores, this 8 GB RAM / integrated GPU machine may report `LanguageModel.availability() === 'unavailable'` unless Chrome's hardware check is bypassed via flags or run on a ≥16 GB RAM / >4 GB VRAM machine. The deterministic redaction fallback and `?forceCloud=1` path in the design handle environments where Nano is unavailable.

---

## 3. Day 2 Latency Matrix — `general_move` (`generateContentStream`, `timeout: 60000`)

Measured on 17 Nov 2026 using `generateContentStream` with `RequestOptions { timeout: 60000 }`, `responseMimeType: 'application/json'`, `responseSchema: cloudSchema('general_move')`, and the Button 3 `general_move` input (`Skeptical VC`, Round 1).

| Model | `thinkingLevel` | Time to First Chunk (ms) | Total Time (ms) | Schema-Valid |
|---|---|---:|---:|:---:|
| `gemini-4-hydrogen` | `MINIMAL` | n/a | 996 | no |
| `gemini-4-hydrogen` | `LOW` | n/a | 60006 (run 1) / 60003 (run 2) / 60015 (run 3) | no |
| `gemini-4-hydrogen` | `MEDIUM` | n/a | 6096 (run 1, HTTP 500) / 60015 (run 2) | no |
| `gemini-3.8-flash` | `MINIMAL` | n/a | 1032 | no |
| `gemini-3.8-flash` | `LOW` | n/a | 60009 (run 1) / 9764 (run 2, HTTP 500) / 60005 (run 3) | no |

### Outputs

#### `gemini-4-hydrogen` — `MINIMAL`
```text
FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/war-room-hybrid/models/gemini-4-hydrogen:streamGenerateContent?alt=sse: [400 ] Thinking level MINIMAL is not supported for this model. Please retry with other thinking level. (AI/fetch-error)
```

#### `gemini-4-hydrogen` — `LOW`
```text
AbortError: Timeout has expired.
```

#### `gemini-4-hydrogen` — `MEDIUM`
Run 1 (6,096 ms):
```text
FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/war-room-hybrid/models/gemini-4-hydrogen:streamGenerateContent?alt=sse: [500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. (AI/fetch-error)
```
Run 2 (60,015 ms):
```text
AbortError: Timeout has expired.
```

#### `gemini-3.8-flash` — `MINIMAL`
```text
FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/war-room-hybrid/models/gemini-3.8-flash:streamGenerateContent?alt=sse: [400 ] Thinking level MINIMAL is not supported for this model. Please retry with other thinking level. (AI/fetch-error)
```

#### `gemini-3.8-flash` — `LOW`
Run 1 (60,009 ms) & Run 3 (60,005 ms):
```text
AbortError: Timeout has expired.
```
Run 2 (9,764 ms):
```text
FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/war-room-hybrid/models/gemini-3.8-flash:streamGenerateContent?alt=sse: [500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. (AI/fetch-error)
```
