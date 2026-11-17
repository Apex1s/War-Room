import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  ThinkingLevel,
  type AI,
  type LanguageModelCreateCoreOptions,
  type SchemaRequest,
} from 'firebase/ai';
import { PROMPTS, type PromptInput } from '../../packages/core/prompts';
import { cloudSchema, deviceSchema, OUTPUT_SCHEMAS } from '../../packages/core/src/ai/schemas';

interface ChromeLanguageModel {
  availability(options?: LanguageModelCreateCoreOptions): Promise<string>;
}

declare global {
  interface Window {
    LanguageModel?: ChromeLanguageModel;
  }
}

const firebaseStatusEl = document.getElementById('firebase-status') as HTMLElement;
const authStatusEl = document.getElementById('auth-status') as HTMLElement;
const nanoStatusEl = document.getElementById('nano-status') as HTMLElement;
const downloadStatusEl = document.getElementById('download-status') as HTMLElement;
const downloadProgressEl = document.getElementById('download-progress') as HTMLProgressElement;

const btnCheckDevice = document.getElementById('btn-check-device') as HTMLButtonElement;
const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
const btnOnlyDevice = document.getElementById('btn-only-device') as HTMLButtonElement;
const btnPreferDevice = document.getElementById('btn-prefer-device') as HTMLButtonElement;
const btnOnlyCloud = document.getElementById('btn-only-cloud') as HTMLButtonElement;

const resultTitleEl = document.getElementById('result-title') as HTMLElement;
const resultSourceEl = document.getElementById('result-source') as HTMLElement;
const resultLatencyEl = document.getElementById('result-latency') as HTMLElement;
const resultValidEl = document.getElementById('result-valid') as HTMLElement;
const resultOutputEl = document.getElementById('result-output') as HTMLElement;

const matrixStatusEl = document.getElementById('matrix-status') as HTMLElement;
const matrixTbodyEl = document.getElementById('matrix-tbody') as HTMLElement;
const matrixStreamPreviewEl = document.getElementById('matrix-stream-preview') as HTMLElement;
const matrixMarkdownEl = document.getElementById('matrix-markdown') as HTMLElement;

const btnMatrixAll = document.getElementById('btn-matrix-all') as HTMLButtonElement;
const btnMatrixHMin = document.getElementById('btn-matrix-h-min') as HTMLButtonElement;
const btnMatrixHLow = document.getElementById('btn-matrix-h-low') as HTMLButtonElement;
const btnMatrixHMed = document.getElementById('btn-matrix-h-med') as HTMLButtonElement;
const btnMatrixFMin = document.getElementById('btn-matrix-f-min') as HTMLButtonElement;
const btnMatrixFLow = document.getElementById('btn-matrix-f-low') as HTMLButtonElement;

const CROWD_INPUT: PromptInput['crowd'] = {
  situation:
    'A founder is about to commit to a startup plan and is testing it against investors, rivals and the market. Objective: Reach 1,000 paying teams in 12 months without raising a seed round.',
  userHeadline:
    'Launch self-serve tier for [COMPANY_1] at [MONEY_1]/seat with a 14-day free trial and zero sales calls.',
  generalHeadlines: [
    { name: 'Skeptical VC', headline: 'Pass on seed round and fund a vertical competitor with lower CAC.' },
    { name: 'Copycat Competitor', headline: 'Bundle an 80%-good-enough version free for existing enterprise seats.' },
    { name: 'The Market', headline: 'Mid-market buyers delay switching until annual contract renewal.' },
  ],
  personas: [
    {
      id: 'p1',
      label: 'Busy team lead at a mid-size company',
      outlook: 'Would pay to save time but has been burned by tools nobody adopted.',
    },
  ],
};

const GENERAL_MOVE_INPUT: PromptInput['general_move'] = {
  general: {
    id: 'vc',
    name: 'Skeptical VC',
    role: 'a partner at an early-stage fund who has heard this pitch forty times',
    persona:
      'You have funded two companies in this space and written off one. You like the founder but you are paid to find the reason not to invest. You think in terms of market size, defensibility and what has to be true for this to return the fund.',
    goal: 'Decide whether to invest, and on what terms. Expose any assumption that only works on a slide.',
    hiddenInfo:
      'Your fund already holds a stake in a company one step away from this market, and your partners will not approve anything that competes with it. You also know that seed valuations in this category have fallen by about a third this year.',
    style: 'Calm, numerate, slightly bored. Short sentences. Asks the question the founder hoped nobody would ask.',
    color: '#E0A84B',
  },
  otherGenerals: [
    { id: 'copycat', name: 'Copycat Competitor' },
    { id: 'market', name: 'The Market' },
  ],
  objective: 'Reach 1,000 paying teams in 12 months for [COMPANY_1] without raising a seed round.',
  brief:
    '[COMPANY_1] is building [PRODUCT_1], an automated workflow auditing tool for mid-size ops teams in [PLACE_1]. Current ARR is [MONEY_1] across 18 design partners. We plan to launch self-serve at [MONEY_2] per seat next month.',
  legend: ['[MONEY_1]: between $100K and $500K', '[MONEY_2]: under $50'],
  history: [],
  round: 1,
  totalRounds: 3,
  move: 'Launch as described in the brief, targeting self-serve team leads first.',
};

interface MatrixRowSpec {
  id: string;
  model: 'gemini-4-hydrogen' | 'gemini-3.8-flash';
  thinkingLevel: ThinkingLevel;
  thinkingLabel: 'MINIMAL' | 'LOW' | 'MEDIUM';
}

interface MatrixRowResult {
  spec: MatrixRowSpec;
  firstChunkMs: number | null;
  totalMs: number;
  schemaValid: 'yes' | 'no';
  inferenceSource: string;
  outputText: string;
}

const MATRIX_ROWS: MatrixRowSpec[] = [
  { id: 'h-min', model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.MINIMAL, thinkingLabel: 'MINIMAL' },
  { id: 'h-low', model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, thinkingLabel: 'LOW' },
  { id: 'h-med', model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.MEDIUM, thinkingLabel: 'MEDIUM' },
  { id: 'f-min', model: 'gemini-3.8-flash', thinkingLevel: ThinkingLevel.MINIMAL, thinkingLabel: 'MINIMAL' },
  { id: 'f-low', model: 'gemini-3.8-flash', thinkingLevel: ThinkingLevel.LOW, thinkingLabel: 'LOW' },
];

const matrixResults = new Map<string, MatrixRowResult>();

function renderMatrixTable(): void {
  matrixTbodyEl.innerHTML = '';
  for (const spec of MATRIX_ROWS) {
    const res = matrixResults.get(spec.id);
    const tr = document.createElement('tr');
    tr.dataset.rowId = spec.id;
    tr.innerHTML = `
      <td>${spec.model}</td>
      <td>${spec.thinkingLabel}</td>
      <td>${res ? (res.firstChunkMs ?? '—') : '—'}</td>
      <td>${res ? res.totalMs : '—'}</td>
      <td>${res ? res.schemaValid : '—'}</td>
      <td>${res ? res.inferenceSource : '—'}</td>
      <td><pre style="margin:0;max-height:180px;overflow:auto;">${res ? escapeHtml(res.outputText) : 'Not run'}</pre></td>
    `;
    matrixTbodyEl.appendChild(tr);
  }

  const lines: string[] = [
    '| Model | `thinkingLevel` | Time to First Chunk (ms) | Total Time (ms) | Schema-Valid |',
    '|---|---|---:|---:|:---:|',
  ];
  const details: string[] = [];
  for (const spec of MATRIX_ROWS) {
    const res = matrixResults.get(spec.id);
    if (res) {
      lines.push(
        `| \`${spec.model}\` | \`${spec.thinkingLabel}\` | ${res.firstChunkMs ?? 'n/a'} | ${res.totalMs} | ${res.schemaValid} |`,
      );
      details.push(`#### \`${spec.model}\` — \`${spec.thinkingLabel}\`\n\`\`\`json\n${res.outputText}\n\`\`\``);
    } else {
      lines.push(`| \`${spec.model}\` | \`${spec.thinkingLabel}\` | — | — | — |`);
    }
  }
  matrixMarkdownEl.textContent = `${lines.join('\n')}\n\n${details.join('\n\n')}`;
}

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError(`No JSON object found in model output:\n${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function checkDeviceAvailability(): Promise<string> {
  if (!window.LanguageModel) {
    nanoStatusEl.textContent = 'unavailable (window.LanguageModel undefined)';
    return 'unavailable';
  }
  try {
    const availability = await window.LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    nanoStatusEl.textContent = availability;
    return availability;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    nanoStatusEl.textContent = `error: ${msg}`;
    return 'unavailable';
  }
}

let aiInstance: AI | null = null;

async function initFirebase(): Promise<void> {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    firebaseStatusEl.textContent = 'Missing VITE_FIREBASE_* env vars';
    return;
  }

  const app = initializeApp(config);

  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    authStatusEl.textContent = auth.currentUser?.uid ?? 'signed-in';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    authStatusEl.textContent = auth.currentUser?.uid ?? `offline (${msg.slice(0, 32)})`;
  }

  aiInstance = getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: true,
  });

  firebaseStatusEl.textContent = siteKey
    ? `Ready (${import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN ? 'debug token' : 'reCAPTCHA Enterprise'})`
    : 'Ready (no VITE_RECAPTCHA_SITE_KEY)';
}

function requireAI(): AI {
  if (!aiInstance) {
    throw new Error('Firebase AI is not initialised. Check your .env file for VITE_FIREBASE_* variables.');
  }
  return aiInstance;
}

async function handleDownloadModel(): Promise<void> {
  btnDownload.disabled = true;
  downloadProgressEl.hidden = false;
  downloadProgressEl.value = 0;
  downloadStatusEl.textContent = 'Starting…';

  try {
    const ai = requireAI();
    if (!window.LanguageModel) {
      throw new Error('window.LanguageModel is undefined in this browser.');
    }
    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
      },
    });

    await model.initializeDeviceModel((progressValue: number) => {
      downloadProgressEl.value = progressValue;
      downloadStatusEl.textContent = `${Math.round(progressValue * 100)}%`;
    });

    downloadProgressEl.value = 1;
    downloadStatusEl.textContent = '100% (Ready)';
    await checkDeviceAvailability();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    downloadStatusEl.textContent = `Failed: ${msg}`;
  } finally {
    btnDownload.disabled = false;
  }
}

async function runButton1OnlyOnDevice(): Promise<void> {
  const ai = requireAI();
  if (!window.LanguageModel) {
    throw new Error(
      'window.LanguageModel is undefined. Blocked before generateContent because @firebase/ai falls back to cloud when chromeAdapter is undefined.',
    );
  }
  const system = PROMPTS.crowd.system(CROWD_INPUT);
  const user = PROMPTS.crowd.user(CROWD_INPUT);

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: {
        responseConstraint: deviceSchema('crowd'),
      },
    },
  });

  const t0 = performance.now();
  const result = await model.generateContent(user);
  const latencyMs = Math.round(performance.now() - t0);

  const rawText = result.response.text();
  const parsed = OUTPUT_SCHEMAS.crowd.parse(extractJson(rawText));

  renderResult('1. ONLY_ON_DEVICE (crowd)', result.response.inferenceSource, latencyMs, parsed);
}

async function runButton2PreferOnDevice(): Promise<void> {
  const ai = requireAI();
  const system = PROMPTS.crowd.system(CROWD_INPUT);
  const user = PROMPTS.crowd.user(CROWD_INPUT);

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: 'gemini-3.5-flash-lite',
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: cloudSchema('crowd') as SchemaRequest,
      },
    },
    onDeviceParams: {
      createOptions: {
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: {
        responseConstraint: deviceSchema('crowd'),
      },
    },
  });

  const t0 = performance.now();
  const result = await model.generateContent(user);
  const latencyMs = Math.round(performance.now() - t0);

  const rawText = result.response.text();
  const parsed = OUTPUT_SCHEMAS.crowd.parse(extractJson(rawText));

  renderResult('2. PREFER_ON_DEVICE (crowd)', result.response.inferenceSource, latencyMs, parsed);
}

async function runButton3OnlyInCloud(): Promise<void> {
  const ai = requireAI();
  const system = PROMPTS.general_move.system(GENERAL_MOVE_INPUT);
  const user = PROMPTS.general_move.user(GENERAL_MOVE_INPUT);

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: 'gemini-4-hydrogen',
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: cloudSchema('general_move') as SchemaRequest,
      },
    },
  });

  const t0 = performance.now();
  const result = await model.generateContent(user);
  const latencyMs = Math.round(performance.now() - t0);

  const rawText = result.response.text();
  const parsed = OUTPUT_SCHEMAS.general_move.parse(extractJson(rawText));

  renderResult(
    '3. ONLY_IN_CLOUD — gemini-4-hydrogen (general_move)',
    result.response.inferenceSource,
    latencyMs,
    parsed,
  );
}

async function runMatrixRow(spec: MatrixRowSpec): Promise<void> {
  const ai = requireAI();
  const system = PROMPTS.general_move.system(GENERAL_MOVE_INPUT);
  const user = PROMPTS.general_move.user(GENERAL_MOVE_INPUT);

  matrixStatusEl.textContent = `Running ${spec.model} (${spec.thinkingLabel})…`;
  matrixStreamPreviewEl.textContent = `Streaming ${spec.model} (${spec.thinkingLabel})…\n`;

  const model = getGenerativeModel(
    ai,
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: spec.model,
        systemInstruction: system,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: cloudSchema('general_move') as SchemaRequest,
          thinkingConfig: {
            thinkingLevel: spec.thinkingLevel,
          },
        },
      },
    },
    { timeout: 60000 },
  );

  const t0 = performance.now();
  let firstChunkMs: number | null = null;
  let streamedText = '';

  try {
    const streamResult = await model.generateContentStream(user);
    for await (const chunk of streamResult.stream) {
      const piece = chunk.text();
      if (firstChunkMs === null && piece.length > 0) {
        firstChunkMs = Math.round(performance.now() - t0);
      }
      streamedText += piece;
      matrixStreamPreviewEl.textContent = `${spec.model} (${spec.thinkingLabel}) [firstChunk=${firstChunkMs ?? '…'} ms]:\n${streamedText}`;
    }

    const finalResponse = await streamResult.response;
    const totalMs = Math.round(performance.now() - t0);
    if (firstChunkMs === null) {
      firstChunkMs = totalMs;
    }

    const fullText = finalResponse.text() || streamedText;
    let schemaValid: 'yes' | 'no' = 'no';
    let formattedOutput = fullText;

    try {
      const extracted = extractJson(fullText);
      const parsed = OUTPUT_SCHEMAS.general_move.safeParse(extracted);
      if (parsed.success) {
        schemaValid = 'yes';
        formattedOutput = JSON.stringify(parsed.data, null, 2);
      } else {
        schemaValid = 'no';
        formattedOutput = JSON.stringify({ error: parsed.error.issues, raw: extracted }, null, 2);
      }
    } catch {
      schemaValid = 'no';
    }

    matrixResults.set(spec.id, {
      spec,
      firstChunkMs,
      totalMs,
      schemaValid,
      inferenceSource: finalResponse.inferenceSource ?? 'undefined',
      outputText: formattedOutput,
    });
    matrixStatusEl.textContent = `Done: ${spec.model} (${spec.thinkingLabel}) in ${totalMs} ms`;
  } catch (err) {
    const totalMs = Math.round(performance.now() - t0);
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    matrixResults.set(spec.id, {
      spec,
      firstChunkMs,
      totalMs,
      schemaValid: 'no',
      inferenceSource: 'error',
      outputText: message,
    });
    matrixStatusEl.textContent = `Error on ${spec.model} (${spec.thinkingLabel}) after ${totalMs} ms`;
  }

  renderMatrixTable();
}

function setAllButtonsDisabled(disabled: boolean): void {
  btnOnlyDevice.disabled = disabled;
  btnPreferDevice.disabled = disabled;
  btnOnlyCloud.disabled = disabled;
  btnMatrixAll.disabled = disabled;
  btnMatrixHMin.disabled = disabled;
  btnMatrixHLow.disabled = disabled;
  btnMatrixHMed.disabled = disabled;
  btnMatrixFMin.disabled = disabled;
  btnMatrixFLow.disabled = disabled;
}

async function runSingleMatrixRow(spec: MatrixRowSpec): Promise<void> {
  setAllButtonsDisabled(true);
  try {
    await runMatrixRow(spec);
  } finally {
    setAllButtonsDisabled(false);
  }
}

async function runAllMatrixRows(): Promise<void> {
  setAllButtonsDisabled(true);
  try {
    for (const spec of MATRIX_ROWS) {
      await runMatrixRow(spec);
    }
    matrixStatusEl.textContent = 'Completed all 5 rows';
  } finally {
    setAllButtonsDisabled(false);
  }
}

function renderResult(
  title: string,
  inferenceSource: string | undefined,
  latencyMs: number,
  parsedJson: unknown,
): void {
  resultTitleEl.textContent = title;
  resultSourceEl.textContent = `inferenceSource: ${inferenceSource ?? 'undefined'}`;
  resultLatencyEl.textContent = `latency: ${latencyMs} ms`;
  resultValidEl.textContent = 'schema: valid (zod)';
  resultOutputEl.textContent = JSON.stringify(
    {
      inferenceSource: inferenceSource ?? null,
      latencyMs,
      parsed: parsedJson,
    },
    null,
    2,
  );
}

function renderError(title: string, err: unknown, latencyMs: number): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  resultTitleEl.textContent = `${title} — Error`;
  resultSourceEl.textContent = 'inferenceSource: error';
  resultLatencyEl.textContent = `latency: ${latencyMs} ms`;
  resultValidEl.textContent = 'schema: failed';
  resultOutputEl.textContent = message;
}

async function withBusy(title: string, fn: () => Promise<void>): Promise<void> {
  setAllButtonsDisabled(true);
  resultTitleEl.textContent = `${title} — Running…`;
  resultOutputEl.textContent = 'Waiting for model response…';
  const t0 = performance.now();
  try {
    await fn();
  } catch (err) {
    renderError(title, err, Math.round(performance.now() - t0));
  } finally {
    setAllButtonsDisabled(false);
  }
}

btnCheckDevice.addEventListener('click', () => {
  void checkDeviceAvailability();
});

btnDownload.addEventListener('click', () => {
  void handleDownloadModel();
});

btnOnlyDevice.addEventListener('click', () => {
  void withBusy('1. ONLY_ON_DEVICE (crowd)', runButton1OnlyOnDevice);
});

btnPreferDevice.addEventListener('click', () => {
  void withBusy('2. PREFER_ON_DEVICE (crowd)', runButton2PreferOnDevice);
});

btnOnlyCloud.addEventListener('click', () => {
  void withBusy('3. ONLY_IN_CLOUD — gemini-4-hydrogen (general_move)', runButton3OnlyInCloud);
});

btnMatrixAll.addEventListener('click', () => {
  void runAllMatrixRows();
});

btnMatrixHMin.addEventListener('click', () => {
  void runSingleMatrixRow(MATRIX_ROWS[0]);
});
btnMatrixHLow.addEventListener('click', () => {
  void runSingleMatrixRow(MATRIX_ROWS[1]);
});
btnMatrixHMed.addEventListener('click', () => {
  void runSingleMatrixRow(MATRIX_ROWS[2]);
});
btnMatrixFMin.addEventListener('click', () => {
  void runSingleMatrixRow(MATRIX_ROWS[3]);
});
btnMatrixFLow.addEventListener('click', () => {
  void runSingleMatrixRow(MATRIX_ROWS[4]);
});

renderMatrixTable();
void checkDeviceAvailability();
void initFirebase();
