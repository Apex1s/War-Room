import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AI } from 'firebase/ai';
import {
  hasDeviceWarmedUp,
  refreshDeviceAvailability,
  registerDeviceAi,
  resetDeviceWarmUpForTest,
  setDeviceStatusForTest,
  warmUpDeviceModel,
} from './device';
import { clearLedger, getHybridStats, getLedger } from './ledger';
import { buildFirebaseModelParams } from './provider-firebase';
import { createMockProvider, type MockProviderController } from './provider-mock';
import {
  AiError,
  clearModelCache,
  parseRetryDelayMs,
  run,
  setEgressGuard,
  setProvider,
  setRetrySleepForTest,
} from './router';
import {
  DEFAULT_ROUTING_TABLE,
  parseRoutingTable,
  setRoutingTable,
  setUrlOverridesForTest,
} from './routing-table';
import { applyRemoteConfigRoutingTableJson } from '../firebase/init';
import {
  crowdCloudSchema,
  crowdDeviceSchema,
  refereeRoundCloudSchema,
  refereeRoundDeviceSchema,
} from './schemas';

const SAMPLE_CROWD_INPUT = {
  situation: 'A founder is stress-testing a startup plan.',
  userHeadline: 'Launch self-serve tier for [COMPANY_1] at [MONEY_1]/seat.',
  generalHeadlines: [
    { name: 'Skeptical VC', headline: 'Pass on seed round.' },
  ],
  personas: [
    { id: 'p1', label: 'Busy team lead', outlook: 'Wants fast setup.' },
  ],
};

const SAMPLE_GENERAL_MOVE_INPUT = {
  general: {
    id: 'vc',
    name: 'Skeptical VC',
    role: 'a partner at an early-stage fund',
    persona: 'Skeptical early-stage partner.',
    goal: 'Expose weak assumptions.',
    hiddenInfo: 'Portfolio conflict.',
    style: 'Calm, numerate.',
    color: '#E0A84B',
  },
  otherGenerals: [
    { id: 'copycat', name: 'Copycat Competitor' },
    { id: 'market', name: 'The Market' },
  ],
  objective: 'Reach 1,000 paying teams for [COMPANY_1].',
  brief: '[COMPANY_1] is building [PRODUCT_1] at [MONEY_1] ARR.',
  legend: [],
  history: [],
  round: 1,
  totalRounds: 3,
  move: 'Launch self-serve tier.',
};

describe('AI Router & Routing Table', () => {
  let mock: MockProviderController;
  const originalLanguageModel = (globalThis as Record<string, unknown>).LanguageModel;

  beforeEach(() => {
    mock = createMockProvider();
    setProvider(mock);
    setRoutingTable(DEFAULT_ROUTING_TABLE);
    setUrlOverridesForTest(null);
    setEgressGuard(null);
    clearLedger();
    clearModelCache();
    resetDeviceWarmUpForTest();
    setRetrySleepForTest(async () => {});

    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);
  });

  afterEach(() => {
    setRetrySleepForTest(null);
    if (originalLanguageModel === undefined) {
      delete (globalThis as Record<string, unknown>).LanguageModel;
    } else {
      (globalThis as Record<string, unknown>).LanguageModel = originalLanguageModel;
    }
    setUrlOverridesForTest(null);
  });

  it(' enforces privacy clamp on raw tasks regardless of URL overrides or routing table', async () => {
    // Even when ?forceCloud=1 is active, raw tasks (redact, referee_live) must never go to cloud;
    // instead they behave as device_unavailable and build zero models.
    setUrlOverridesForTest({ forceCloud: true });

    await expect(
      run('redact', { text: 'Acme will launch in Casablanca.' }),
    ).rejects.toMatchObject({
      name: 'AiError',
      code: 'device_unavailable',
      task: 'redact',
    });

    expect(mock.createdModels).toHaveLength(0);
    expect(mock.calls).toHaveLength(0);

    // When forceCloud is off and device is available, redact runs strictly with only_on_device
    setUrlOverridesForTest({ forceCloud: false });
    const res = await run('redact', {
      text: 'Acme will launch in Casablanca.',
    });

    expect(res.source).toBe('on-device');
    expect(res.model).toBe('gemini-nano');
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.createdModels[0].mode).toBe('only_on_device');
  });

  it('throws device_unavailable BEFORE building any model when globalThis.LanguageModel is deleted', async () => {
    // Even if device status was previously cached as 'available', deleting LanguageModel from globalThis
    // must immediately trip the privacy lock before provider.createModel is called.
    setDeviceStatusForTest('available', 1);
    delete (globalThis as Record<string, unknown>).LanguageModel;

    await expect(
      run('redact', { text: 'Confidential brief for Acme.' }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'device_unavailable',
        task: 'redact',
      }),
    );

    await expect(
      run('referee_live', {
        draft: 'We will cut prices by 20% in Q2 for Acme.',
        commitments: [],
        threats: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'device_unavailable',
        task: 'referee_live',
      }),
    );

    expect(mock.createdModels).toHaveLength(0);
    expect(mock.calls).toHaveLength(0);
  });

  it('retries once with the repair prompt on invalid JSON and succeeds on the same model instance', async () => {
    mock.enqueueResponses([
      'not valid json at all {{{',
      JSON.stringify({
        reactions: [
          {
            personaId: 'p1',
            quote: 'Fixed JSON response on second try.',
            sentiment: 2,
          },
        ],
      }),
    ]);

    const res = await run('crowd', SAMPLE_CROWD_INPUT);

    expect(res.repaired).toBe(true);
    expect(res.source).toBe('on-device');
    expect(res.output.reactions).toEqual([
      {
        personaId: 'p1',
        quote: 'Fixed JSON response on second try.',
        sentiment: 2,
      },
    ]);
    // Same cached model instance used for both initial call and repair call
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[1].userPrompt).toContain(
      'Your previous reply did not match the required JSON format.',
    );
  });

  it('throws invalid_json when the model returns invalid JSON twice', async () => {
    mock.enqueueResponses([
      '{"reactions": [{"personaId": "p1", "quote": "", "sentiment": 99}]}',
      'still broken json',
    ]);

    let caught: unknown;
    try {
      await run('crowd', SAMPLE_CROWD_INPUT);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AiError);
    expect((caught as AiError).code).toBe('invalid_json');
    expect((caught as AiError).task).toBe('crowd');
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.calls).toHaveLength(2);
  });

  it('throws aborted when AbortSignal is triggered', async () => {
    const controller = new AbortController();

    mock.setHandler(async (_params, _prompt, _idx, opts) => {
      controller.abort();
      if (opts?.signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { text: '{}', inferenceSource: 'on_device' };
    });

    await expect(
      run('crowd', SAMPLE_CROWD_INPUT, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AiError',
      code: 'aborted',
      task: 'crowd',
    });
  });

  it('maps response.inferenceSource to source and records fallback in ledger', async () => {
    mock.enqueueResponses([
      {
        text: JSON.stringify({
          reactions: [{ personaId: 'p1', quote: 'Cloud fallback answer.', sentiment: -1 }],
        }),
        inferenceSource: 'in_cloud',
      },
    ]);

    const res = await run('crowd', SAMPLE_CROWD_INPUT, { gameId: 'g1' });

    expect(res.source).toBe('cloud');
    expect(res.fallback).toBe(true);
    expect(res.model).toBe('gemini-3.5-flash-lite');

    const entries = getLedger('g1');
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('cloud');
    expect(entries[0].fallback).toBe(true);
    expect(entries[0].cloudPayload).toBeDefined();

    const stats = getHybridStats('g1', 500);
    expect(stats.totalCalls).toBe(1);
    expect(stats.cloudCalls).toBe(1);
    expect(stats.onDeviceCalls).toBe(0);
    expect(stats.charsKeptLocal).toBe(500);
  });

  it('parses Remote Config routing_table JSON and falls back to defaults on invalid JSON', () => {
    expect(parseRoutingTable('invalid json')).toEqual(DEFAULT_ROUTING_TABLE);
    expect(parseRoutingTable(null)).toEqual(DEFAULT_ROUTING_TABLE);

    const custom = {
      ...DEFAULT_ROUTING_TABLE,
      tasks: {
        ...DEFAULT_ROUTING_TABLE.tasks,
        general_move: {
          mode: 'only_in_cloud',
          cloudModel: 'gemini-3.8-flash',
          fallbackModel: 'gemini-3.5-flash-lite',
          deviceLastResort: true,
          thinkingLevel: 'LOW',
          timeoutMs: 30000,
        },
      },
    };
    const parsed = parseRoutingTable(JSON.stringify(custom));
    expect(parsed.tasks.general_move.cloudModel).toBe('gemini-3.8-flash');
    expect(parsed.tasks.general_move.fallbackModel).toBe('gemini-3.5-flash-lite');
    expect(parsed.tasks.general_move.deviceLastResort).toBe(true);
    expect(parsed.tasks.general_move.timeoutMs).toBe(30000);
    expect(DEFAULT_ROUTING_TABLE.tasks.general_move.thinkingLevel).toBeUndefined();
  });

  it('omits thinkingConfig when thinkingLevel is unset and includes it when set', () => {
    const withoutThinking = buildFirebaseModelParams({
      task: 'general_move',
      mode: 'only_in_cloud',
      cloudModel: 'gemini-3.5-flash-lite',
      timeoutMs: 25000,
      system: 'sys',
    });
    expect(withoutThinking.inCloudParams?.generationConfig?.thinkingConfig).toBeUndefined();
    expect('thinkingConfig' in (withoutThinking.inCloudParams?.generationConfig ?? {})).toBe(false);

    const withThinking = buildFirebaseModelParams({
      task: 'final_report',
      mode: 'only_in_cloud',
      cloudModel: 'gemini-4-hydrogen',
      thinkingLevel: 'LOW',
      timeoutMs: 90000,
      system: 'sys',
    });
    expect(withThinking.inCloudParams?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    });
  });

  it('retries the same model up to 3 times (1.5s / 4s / 8s backoff) on 500/503/parse-failed/timeout, then fallbackModel with 12s timeout, then Nano when deviceLastResort', async () => {
    const sleepLog: number[] = [];
    setRetrySleepForTest(async (ms) => {
      sleepLog.push(ms);
    });

    // Case 1: Same-model retry succeeds on the 3rd retry (after 1.5s, 4s, 8s)
    mock.enqueueResponses([
      new Error('AI: Error fetching from ...: [500 ] High demand (AI/fetch-error)'),
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AbortError: Timeout has expired.'),
      {
        text: JSON.stringify({
          headline: 'Primary recovered on 3rd same-model retry',
          move: 'I pass on [COMPANY_1] and back a rival.',
          rationale: 'CAC is too high.',
          threatLevel: 3,
          targets: 'Low self-serve CAC assumption',
        }),
        inferenceSource: 'in_cloud',
      },
    ]);

    const resSame = await run('general_move', SAMPLE_GENERAL_MOVE_INPUT);
    expect(resSame.fallback).toBe(false);
    expect(resSame.source).toBe('cloud');
    expect(resSame.model).toBe('gemini-3.5-flash-lite');
    expect(sleepLog).toEqual([1500, 4000, 8000]);
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.calls).toHaveLength(4);

    // Case 2: Primary fails initial + 3 retries -> fallbackModel answers with 12s timeout
    mock.reset();
    clearModelCache();
    sleepLog.length = 0;

    mock.enqueueResponses([
      new Error('AI: Error fetching from ...: [500 ] High demand (AI/fetch-error)'),
      new Error('AI: Error fetching from ...: [503 ] Service Unavailable (AI/fetch-error)'),
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AbortError: Timeout has expired.'),
      {
        text: JSON.stringify({
          headline: 'Fallback model answered',
          move: 'I pass on [COMPANY_1] and back a rival.',
          rationale: 'CAC is too high.',
          threatLevel: 4,
          targets: 'Low self-serve CAC assumption',
        }),
        inferenceSource: 'in_cloud',
      },
    ]);

    const resFallback = await run('general_move', SAMPLE_GENERAL_MOVE_INPUT);
    expect(resFallback.fallback).toBe(true);
    expect(resFallback.source).toBe('cloud');
    expect(resFallback.model).toBe('gemini-3.8-flash');
    expect(resFallback.output.headline).toBe('Fallback model answered');
    expect(sleepLog).toEqual([1500, 4000, 8000]);
    expect(mock.createdModels).toHaveLength(2);
    expect(mock.createdModels[0]).toMatchObject({
      task: 'general_move',
      mode: 'only_in_cloud',
      cloudModel: 'gemini-3.5-flash-lite',
      timeoutMs: 25000,
    });
    expect(mock.createdModels[1]).toMatchObject({
      task: 'general_move',
      mode: 'prefer_in_cloud',
      cloudModel: 'gemini-3.8-flash',
      thinkingLevel: undefined,
      timeoutMs: 12000,
    });

    // Case 3: Primary fails initial + 3 retries AND fallbackModel fails -> Nano answers when deviceLastResort is true
    mock.reset();
    clearModelCache();
    sleepLog.length = 0;

    mock.enqueueResponses([
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AI: Failed to parse stream (AI/parse-failed)'),
      new Error('AbortError: Timeout has expired.'),
      {
        text: JSON.stringify({
          headline: 'Nano last-resort answered',
          move: 'I hold our position against [COMPANY_1].',
          rationale: 'Local fallback succeeded.',
          threatLevel: 2,
          targets: 'Cloud availability',
        }),
        inferenceSource: 'on_device',
      },
    ]);

    const resNano = await run('general_move', SAMPLE_GENERAL_MOVE_INPUT);
    expect(resNano.fallback).toBe(true);
    expect(resNano.source).toBe('on-device');
    expect(resNano.model).toBe('gemini-nano');
    expect(resNano.output.headline).toBe('Nano last-resort answered');
    expect(sleepLog).toEqual([1500, 4000, 8000]);
    expect(mock.createdModels).toHaveLength(3);
    expect(mock.createdModels[2]).toMatchObject({
      task: 'general_move',
      mode: 'only_on_device',
    });
  });

  it('waits retryDelay <= 20s on 429 before retrying same model, and skips same-model retry if retryDelay > 20s', async () => {
    const sleepLog: number[] = [];
    setRetrySleepForTest(async (ms) => {
      sleepLog.push(ms);
    });

    expect(
      parseRetryDelayMs(
        new Error('429 Too Many Requests [{"retryDelay":"12s"}]'),
      ),
    ).toBe(12000);
    expect(
      parseRetryDelayMs(
        new Error('429 Too Many Requests [{"retryDelay":"45s"}]'),
      ),
    ).toBe(45000);

    // 429 with retryDelay 12s (<= 20s) -> waits 12000ms and retries same model
    mock.enqueueResponses([
      new Error('429 RESOURCE_Exhausted [{"retryDelay":"12s"}]'),
      {
        text: JSON.stringify({
          reactions: [
            {
              personaId: 'p1',
              quote: 'Recovered after 12s 429 delay on same model.',
              sentiment: 1,
            },
          ],
        }),
        inferenceSource: 'in_cloud',
      },
    ]);

    const res12 = await run('crowd', SAMPLE_CROWD_INPUT);
    expect(res12.model).toBe('gemini-3.5-flash-lite');
    expect(sleepLog).toEqual([12000]);
    expect(mock.createdModels).toHaveLength(1);

    // 429 with retryDelay 35s (> 20s) -> skips same-model retry and jumps straight to fallbackModel
    mock.reset();
    clearModelCache();
    sleepLog.length = 0;

    mock.enqueueResponses([
      new Error('429 RESOURCE_Exhausted [{"retryDelay":"35s"}]'),
      {
        text: JSON.stringify({
          reactions: [
            {
              personaId: 'p1',
              quote: 'Answered by fallback model after 35s retryDelay.',
              sentiment: 1,
            },
          ],
        }),
        inferenceSource: 'in_cloud',
      },
    ]);

    const res35 = await run('crowd', SAMPLE_CROWD_INPUT);
    expect(res35.fallback).toBe(true);
    expect(res35.model).toBe('gemini-3.8-flash');
    expect(sleepLog).toEqual([]);
    expect(mock.createdModels).toHaveLength(2);
    expect(mock.createdModels[1]).toMatchObject({
      task: 'crowd',
      mode: 'only_in_cloud',
      cloudModel: 'gemini-3.8-flash',
      thinkingLevel: undefined,
    });
  });

  it('fails closed with egress_blocked when provider is firebase and no egress guard is set', async () => {
    let createdCount = 0;
    setProvider({
      kind: 'firebase',
      createModel() {
        createdCount++;
        return {
          async generateStream() {
            return { text: '{}', inferenceSource: 'in_cloud' as const };
          },
        };
      },
    });
    setEgressGuard(null);

    await expect(
      run('general_move', SAMPLE_GENERAL_MOVE_INPUT),
    ).rejects.toMatchObject({
      name: 'AiError',
      code: 'egress_blocked',
      task: 'general_move',
    });

    await expect(
      run('crowd', SAMPLE_CROWD_INPUT),
    ).rejects.toMatchObject({
      name: 'AiError',
      code: 'egress_blocked',
      task: 'crowd',
    });

    expect(createdCount).toBe(0);
  });

  it('wires per-call crowd and referee_round schemas into buildFirebaseModelParams and includes schemaIds in the model cache key', async () => {
    const crowdIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const crowdParams = buildFirebaseModelParams({
      task: 'crowd',
      mode: 'prefer_on_device',
      cloudModel: 'gemini-3.5-flash-lite',
      timeoutMs: 20000,
      system: 'sys',
      schemaIds: crowdIds,
    });
    expect(crowdParams.onDeviceParams?.promptOptions?.responseConstraint).toEqual(
      crowdDeviceSchema(crowdIds),
    );
    expect(crowdParams.inCloudParams?.generationConfig?.responseSchema).toEqual(
      crowdCloudSchema(crowdIds),
    );

    const generalIds = ['vc', 'copycat', 'market'];
    const refParams = buildFirebaseModelParams({
      task: 'referee_round',
      mode: 'prefer_on_device',
      cloudModel: 'gemini-3.5-flash-lite',
      timeoutMs: 20000,
      system: 'sys',
      schemaIds: generalIds,
    });
    expect(refParams.onDeviceParams?.promptOptions?.responseConstraint).toEqual(
      refereeRoundDeviceSchema(generalIds),
    );
    expect(refParams.inCloudParams?.generationConfig?.responseSchema).toEqual(
      refereeRoundCloudSchema(generalIds),
    );

    expect(DEFAULT_ROUTING_TABLE.crowd).toEqual({
      personas: 10,
      perRound: 5,
      batchOnDevice: 5,
      batchInCloud: 5,
    });

    // Running crowd twice with identical persona IDs reuses the cached model
    await run('crowd', SAMPLE_CROWD_INPUT);
    await run('crowd', SAMPLE_CROWD_INPUT);
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.createdModels[0].schemaIds).toEqual(['p1']);

    // Running crowd with a different rotating persona batch creates a new cached model
    await run('crowd', {
      ...SAMPLE_CROWD_INPUT,
      personas: [
        { id: 'p2', label: 'Ops lead', outlook: 'Skeptical.' },
        { id: 'p3', label: 'CFO', outlook: 'Watches budget.' },
      ],
    });
    expect(mock.createdModels).toHaveLength(2);
    expect(mock.createdModels[1].schemaIds).toEqual(['p2', 'p3']);

    // Running referee_round passes generalIds in prompt order
    await run('referee_round', {
      round: 1,
      totalRounds: 3,
      move: 'Launch self-serve tier.',
      replies: [
        { generalId: 'vc', name: 'Skeptical VC', threatLevel: 3, move: 'Pass on seed.' },
        { generalId: 'copycat', name: 'Copycat Competitor', threatLevel: 4, move: 'Bundle free.' },
        { generalId: 'market', name: 'The Market', threatLevel: 2, move: 'Wait for renewal.' },
      ],
      commitments: [],
    });
    expect(mock.createdModels).toHaveLength(3);
    expect(mock.createdModels[2].schemaIds).toEqual(['vc', 'copycat', 'market']);
  });

  it('fires one tiny background ONLY_ON_DEVICE warm-up prompt when device status becomes available without recording in the ledger', async () => {
    const promptsSent: { mode: string; req: unknown }[] = [];
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };

    const fakeAi = {
      app: {
        name: '[DEFAULT]',
        options: { apiKey: 'test-key', projectId: 'test-proj', appId: 'test-app' },
      },
      backend: { backendType: 'GOOGLE_AI' },
      location: 'us-central1',
      chromeAdapterFactory: (mode: string) => ({
        mode,
        isAvailable: async () => true,
        generateContent: async (req: unknown) => {
          promptsSent.push({ mode, req });
          return new Response(
            JSON.stringify({
              candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }],
            }),
          );
        },
      }),
    } as unknown as AI;

    setDeviceStatusForTest('unknown', 0);
    registerDeviceAi(fakeAi);
    expect(hasDeviceWarmedUp()).toBe(false);

    const status = await refreshDeviceAvailability();
    expect(status).toBe('available');

    // Wait for background warm-up promise
    await warmUpDeviceModel();

    expect(hasDeviceWarmedUp()).toBe(true);
    expect(promptsSent).toHaveLength(1);
    expect(promptsSent[0].mode).toBe('only_on_device');
    expect(getLedger()).toHaveLength(0);

    // Calling again is a no-op
    const secondRun = await warmUpDeviceModel();
    expect(secondRun).toBe(false);
    expect(promptsSent).toHaveLength(1);
    expect(getLedger()).toHaveLength(0);
  });

  it('clears the router model cache and caches last good JSON when Remote Config routing_table updates', async () => {
    await run('crowd', SAMPLE_CROWD_INPUT);
    expect(mock.createdModels).toHaveLength(1);
    expect(mock.createdModels[0].mode).toBe('prefer_on_device');

    const flippedTable = {
      ...DEFAULT_ROUTING_TABLE,
      tasks: {
        ...DEFAULT_ROUTING_TABLE.tasks,
        crowd: {
          ...DEFAULT_ROUTING_TABLE.tasks.crowd,
          mode: 'only_in_cloud' as const,
        },
      },
    };

    await applyRemoteConfigRoutingTableJson(JSON.stringify(flippedTable));

    await run('crowd', SAMPLE_CROWD_INPUT);
    expect(mock.createdModels).toHaveLength(2);
    expect(mock.createdModels[1].mode).toBe('only_in_cloud');
  });
});
