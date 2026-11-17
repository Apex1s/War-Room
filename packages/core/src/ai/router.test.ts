import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStatusForTest } from './device';
import { clearLedger, getHybridStats, getLedger } from './ledger';
import { createMockProvider, type MockProviderController } from './provider-mock';
import {
  AiError,
  clearModelCache,
  run,
  setEgressGuard,
  setProvider,
} from './router';
import {
  DEFAULT_ROUTING_TABLE,
  parseRoutingTable,
  setRoutingTable,
  setUrlOverridesForTest,
} from './routing-table';

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

    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);
  });

  afterEach(() => {
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
});
