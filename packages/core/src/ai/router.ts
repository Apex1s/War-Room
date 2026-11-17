import { getDeviceState, getGlobalLanguageModel } from './device';
import { parseAndValidate, repairPrompt } from './json';
import { recordCall, type Source } from './ledger';
import type {
  ModelProvider,
  ProviderModelInstance,
  ProviderModelParams,
} from './provider';
import { defaultMockProvider } from './provider-mock';
import {
  getRoutingTable,
  onRoutingTableChange,
  parseUrlOverrides,
  resolveTaskRoute,
  type Mode,
} from './routing-table';
import type { Task, TaskOutput } from './schemas';
import { TASKS, type Privacy, type TaskInput } from './tasks';

export type { Mode, Privacy, Source, Task, TaskInput, TaskOutput };

export interface AiResult<T> {
  output: T;
  source: Source;
  latencyMs: number;
  task: Task;
  model: string;
  fallback: boolean;
  repaired: boolean;
}

export interface RunOptions {
  signal?: AbortSignal;
  onText?: (partial: string) => void;
  gameId?: string;
}

export type AiErrorCode =
  | 'device_unavailable'
  | 'cloud_unavailable'
  | 'invalid_json'
  | 'egress_blocked'
  | 'rate_limited'
  | 'aborted';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    public task: Task,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AiError';
  }
}

export type EgressGuardFn = (text: string, gameId?: string) => void;

let configuredProvider: ModelProvider = defaultMockProvider;
let egressGuard: EgressGuardFn | null = null;
const modelCache = new Map<string, ProviderModelInstance>();

export function clearModelCache(): void {
  modelCache.clear();
}

onRoutingTableChange(() => {
  clearModelCache();
});

export function setProvider(provider: ModelProvider): void {
  configuredProvider = provider;
  clearModelCache();
}

export function getProvider(): ModelProvider {
  const overrides = parseUrlOverrides();
  if (overrides.mock) {
    return defaultMockProvider;
  }
  return configuredProvider;
}

export function setEgressGuard(guard: EgressGuardFn | null): void {
  egressGuard = guard;
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function mapInferenceSource(raw: 'on_device' | 'in_cloud'): Source {
  return raw === 'on_device' ? 'on-device' : 'cloud';
}

function isRetryableCloudError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;

  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  const code = (err as { code?: string })?.code ?? '';

  // Timeout
  if (
    name === 'AbortError' ||
    message.includes('Timeout has expired') ||
    message.toLowerCase().includes('timeout')
  ) {
    return true;
  }

  // AI/parse-failed mid-stream
  if (
    code === 'parse-failed' ||
    message.includes('AI/parse-failed') ||
    message.includes('parse-failed') ||
    message.includes('Failed to parse stream')
  ) {
    return true;
  }

  // HTTP 429 / 500 / 503
  if (
    /\b(429|500|503)\b/.test(message) ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('resource_exhausted') ||
    message.toLowerCase().includes('high demand') ||
    message.toLowerCase().includes('service unavailable')
  ) {
    return true;
  }

  return false;
}

function mapProviderError(
  err: unknown,
  task: Task,
  mode: Mode,
  signal?: AbortSignal,
): AiError {
  if (err instanceof AiError) return err;

  if (signal?.aborted) {
    return new AiError('aborted', task, 'Request was aborted');
  }

  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (name === 'AbortError' || message.includes('Timeout has expired')) {
    return new AiError('cloud_unavailable', task, message || 'Request timed out');
  }

  if (
    message.includes('429') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('resource_exhausted')
  ) {
    return new AiError('rate_limited', task, message);
  }

  return new AiError(
    mode === 'only_on_device' ? 'device_unavailable' : 'cloud_unavailable',
    task,
    message,
  );
}

function getOrCreateModel(
  provider: ModelProvider,
  params: ProviderModelParams,
): ProviderModelInstance {
  const cacheKey = [
    provider.kind,
    params.task,
    params.mode,
    params.cloudModel,
    params.thinkingLevel ?? '',
    params.timeoutMs,
    hashString(params.system),
  ].join('|');

  let instance = modelCache.get(cacheKey);
  if (!instance) {
    instance = provider.createModel(params);
    modelCache.set(cacheKey, instance);
  }
  return instance;
}

export async function run<K extends Task>(
  task: K,
  input: TaskInput[K],
  opts?: RunOptions,
): Promise<AiResult<TaskOutput[K]>> {
  const spec = TASKS[task];
  const overrides = parseUrlOverrides();
  const route = resolveTaskRoute(task, spec.privacy, getRoutingTable(), overrides);

  // Step 1: PRIVACY CLAMP — raw tasks are forced to only_on_device regardless of Remote Config or URL.
  const mode: Mode = spec.privacy === 'raw' ? 'only_on_device' : route.mode;

  // Step 2: PRIVACY LOCK — before ANY model is built, verify globalThis.LanguageModel and availability.
  if (mode === 'only_on_device') {
    if (
      overrides.forceCloud ||
      typeof getGlobalLanguageModel() === 'undefined' ||
      getDeviceState().status !== 'available'
    ) {
      throw new AiError(
        'device_unavailable',
        task,
        'On-device model is unavailable or LanguageModel API is missing.',
      );
    }
  }

  if (opts?.signal?.aborted) {
    throw new AiError('aborted', task, 'Request was aborted before start');
  }

  const system = spec.system(input);
  const user = spec.user(input);

  if (user.length > spec.maxInputChars) {
    throw new RangeError(
      `Task "${task}" user prompt is ${user.length} chars, exceeding maxInputChars (${spec.maxInputChars})`,
    );
  }

  // Step 3: Egress guard for any call that can reach the cloud
  if (mode !== 'only_on_device' && egressGuard) {
    try {
      egressGuard(`${system}\n${user}`, opts?.gameId);
    } catch (err) {
      if (err instanceof AiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AiError('egress_blocked', task, msg);
    }
  }

  // Step 4: Get or create cached primary model instance
  const provider = getProvider();
  let activeModelInstance = getOrCreateModel(provider, {
    task,
    mode,
    cloudModel: route.cloudModel,
    thinkingLevel: route.thinkingLevel,
    timeoutMs: route.timeoutMs,
    maxOutputTokens: route.maxOutputTokens,
    system,
  });

  // Step 5: Execute streaming call and time it; retry once on fallbackModel on 429/500/503/timeout/parse-failed
  const t0 = performance.now();
  let streamRes;
  let usedFallbackModel = false;
  let activeCloudModel = route.cloudModel;
  let activeMode: Mode = mode;

  try {
    streamRes = await activeModelInstance.generateStream(user, {
      signal: opts?.signal,
      onText: opts?.onText,
    });
  } catch (err) {
    if (
      mode !== 'only_on_device' &&
      route.fallbackModel &&
      route.fallbackModel !== 'none' &&
      isRetryableCloudError(err, opts?.signal)
    ) {
      usedFallbackModel = true;
      activeCloudModel = route.fallbackModel;
      activeMode = route.deviceLastResort ? 'prefer_in_cloud' : 'only_in_cloud';
      activeModelInstance = getOrCreateModel(provider, {
        task,
        mode: activeMode,
        cloudModel: activeCloudModel,
        thinkingLevel: undefined,
        timeoutMs: route.timeoutMs,
        maxOutputTokens: route.maxOutputTokens,
        system,
      });
      try {
        streamRes = await activeModelInstance.generateStream(user, {
          signal: opts?.signal,
          onText: opts?.onText,
        });
      } catch (retryErr) {
        throw mapProviderError(retryErr, task, activeMode, opts?.signal);
      }
    } else {
      throw mapProviderError(err, task, mode, opts?.signal);
    }
  }

  // Step 6: Read inferenceSource, parse & validate JSON, retry once with repairPrompt on failure
  let source = mapInferenceSource(streamRes.inferenceSource);
  let finalRawText = streamRes.text;
  let repaired = false;

  let validation = parseAndValidate(finalRawText, spec.schema);
  if (!validation.ok) {
    repaired = true;
    const repairUserPrompt = repairPrompt(finalRawText, validation.issues);
    let repairRes;
    try {
      repairRes = await activeModelInstance.generateStream(repairUserPrompt, {
        signal: opts?.signal,
        onText: opts?.onText,
      });
    } catch (err) {
      throw mapProviderError(err, task, activeMode, opts?.signal);
    }

    source = mapInferenceSource(repairRes.inferenceSource);
    finalRawText = repairRes.text;
    validation = parseAndValidate(finalRawText, spec.schema);

    if (!validation.ok) {
      throw new AiError('invalid_json', task, validation.issues);
    }
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - t0));

  // Step 7: Normalize, record in ledger, and return AiResult
  const normalizedOutput = spec.normalize
    ? spec.normalize(validation.data, input)
    : validation.data;

  const fallback =
    usedFallbackModel ||
    (mode === 'prefer_on_device' && source === 'cloud') ||
    (mode === 'prefer_in_cloud' && source === 'on-device');

  const modelName = source === 'on-device' ? 'gemini-nano' : activeCloudModel;
  const inChars = system.length + user.length;
  const outChars = finalRawText.length;

  recordCall({
    gameId: opts?.gameId ?? null,
    task,
    source,
    model: modelName,
    latencyMs,
    inChars,
    outChars,
    fallback,
    repaired,
    ts: Date.now(),
    ...(source === 'cloud' ? { cloudPayload: `${system}\n\n${user}` } : {}),
  });

  return {
    output: normalizedOutput,
    source,
    latencyMs,
    task,
    model: modelName,
    fallback,
    repaired,
  };
}
