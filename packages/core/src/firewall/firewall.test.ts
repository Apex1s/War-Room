import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStatusForTest } from '../ai/device';
import {
  assertClean,
  clearVaultEntries,
  enableDefaultEgressGuard,
  setVaultEntries,
} from '../ai/egress-guard';
import {
  clearNetGuardBlocks,
  getNetGuardBlocks,
  installNetGuard,
  uninstallNetGuard,
  withSealingText,
} from '../ai/net-guard';
import { createMockProvider, type MockProviderController } from '../ai/provider-mock';
import { AiError, clearModelCache, run, setProvider } from '../ai/router';
import { DEFAULT_ROUTING_TABLE, setRoutingTable, setUrlOverridesForTest } from '../ai/routing-table';
import { chunkText } from './chunk';
import { detectCapitalisedRuns } from './detectors';
import { seal } from './firewall';
import { buildMagnitudeLegend, computeMagnitudeHint } from './magnitude';
import {
  applyMap,
  buildMap,
  cleanPunctuation,
  clearInventedTokenLogs,
  getInventedTokenLogs,
  rehydrate,
} from './placeholders';
import { SAMPLE_BRIEFS } from './sample-briefs';

describe('Privacy Firewall, Placeholders, Egress Guard & Network Guard', () => {
  let mock: MockProviderController;
  const originalLanguageModel = (globalThis as Record<string, unknown>).LanguageModel;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mock = createMockProvider();
    setProvider(mock);
    setRoutingTable(DEFAULT_ROUTING_TABLE);
    setUrlOverridesForTest(null);
    enableDefaultEgressGuard();
    clearVaultEntries();
    clearInventedTokenLogs();
    clearNetGuardBlocks();
    clearModelCache();

    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);
  });

  afterEach(() => {
    uninstallNetGuard();
    globalThis.fetch = originalFetch;
    if (originalLanguageModel === undefined) {
      delete (globalThis as Record<string, unknown>).LanguageModel;
    } else {
      (globalThis as Record<string, unknown>).LanguageModel = originalLanguageModel;
    }
    setUrlOverridesForTest(null);
  });

  it('round-trips rehydrate(applyMap(text, map), map) === text when originals have exact casing', () => {
    const text =
      'Acme Cloud will undercut Globex in Casablanca with $240,000 ARR and 14% growth.';
    const map = buildMap(
      [],
      [
        { text: 'Acme Cloud', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Globex', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Casablanca', type: 'PLACE', detectedBy: 'ai' },
        { text: '$240,000 ARR', type: 'MONEY', detectedBy: 'regex' },
        { text: '14%', type: 'PERCENT', detectedBy: 'regex' },
      ],
    );

    const abstracted = applyMap(text, map);
    expect(abstracted).not.toContain('Acme Cloud');
    expect(abstracted).not.toContain('Globex');
    expect(abstracted).not.toContain('Casablanca');
    expect(abstracted).not.toContain('$240,000');
    expect(abstracted).toContain('[COMPANY_1]');
    expect(abstracted).toContain('[COMPANY_2]');
    expect(abstracted).toContain('[PLACE_1]');
    expect(abstracted).toContain('[MONEY_1]');
    expect(abstracted).toContain('[PERCENT_1]');

    expect(rehydrate(abstracted, map)).toBe(text);
  });

  it('handles overlapping entities and a name inside another name without corrupting tokens', () => {
    const text = 'Acme and Acme Cloud both compete with Acme Cloud Enterprise in Lyon.';
    const map = buildMap(
      [],
      [
        { text: 'Acme', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Acme Cloud', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Acme Cloud Enterprise', type: 'PRODUCT', detectedBy: 'ai' },
        { text: 'Lyon', type: 'PLACE', detectedBy: 'ai' },
      ],
    );

    const abstracted = applyMap(text, map);
    expect(abstracted).not.toContain('Acme');
    expect(abstracted).not.toContain('Cloud');
    expect(abstracted).not.toContain('Enterprise');
    // Longest match wins at each position, so [PRODUCT_1] is never broken into "[COMPANY_1] Enterprise"
    expect(rehydrate(abstracted, map)).toBe(text);
  });

  it('only swaps tokens present in sentTokens and replaces invented [TYPE_N] with neutral phrases', () => {
    const map = buildMap(
      [],
      [
        { text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Atlas Cloud', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Amine Tazi', type: 'PERSON', detectedBy: 'ai' },
        { text: '$49', type: 'MONEY', detectedBy: 'regex' },
      ],
    );
    // Suppose Kestrel Labs is [COMPANY_1] or [COMPANY_2]: find which token belongs to Kestrel Labs
    const kestrelEntry = map.find((m) => m.original === 'Kestrel Labs')!;
    const atlasEntry = map.find((m) => m.original === 'Atlas Cloud')!;
    const moneyEntry = map.find((m) => m.original === '$49')!;

    // Prompt sent only included Kestrel Labs and $49 (NOT Atlas Cloud, and NOT [COMPANY_9] or [PERSON_4])
    const sentPrompt = `Objective: Launch ${kestrelEntry.token} self-serve tier at ${moneyEntry.token}/seat.`;
    const modelReply = `I pass on ${kestrelEntry.token} at ${moneyEntry.token} and instead fund ${atlasEntry.token}, [COMPANY_9], [PERSON_4] and [MONEY_7].`;

    const rendered = rehydrate(modelReply, map, sentPrompt);

    expect(rendered).toContain('Kestrel Labs');
    expect(rendered).toContain('$49');
    // Atlas Cloud was in map, but was NOT in sentPrompt -> must NOT be swapped to "Atlas Cloud"
    expect(rendered).not.toContain('Atlas Cloud');
    expect(rendered).toBe(
      'I pass on Kestrel Labs at $49 and instead fund a company, a company, a person and an amount.',
    );

    const logs = getInventedTokenLogs();
    expect(logs.map((l) => l.token)).toEqual([
      atlasEntry.token,
      '[COMPANY_9]',
      '[PERSON_4]',
      '[MONEY_7]',
    ]);
  });

  it('neutralises arbitrary invented bracketed text such as [COMP_1] and [BIG INCOMPETITOR]', () => {
    const map = buildMap(
      [],
      [{ text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' }],
    );

    const crowdReply =
      '[COMP_1] will undercut [COMPANY_1], and [BIG INCOMPETITOR] already owns the market while [SOME_EXEC] watches.';
    const rendered = rehydrate(crowdReply, map, '[COMPANY_1]');

    expect(rendered).toBe(
      'a competitor will undercut Kestrel Labs, and a competitor already owns the market while someone watches.',
    );
    expect(rendered).not.toContain('[');
    expect(rendered).not.toContain(']');
  });

  it('leaves ordinary bracketed words from the player untouched', () => {
    const map = buildMap(
      [],
      [{ text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' }],
    );
    const move = 'Ship [COMPANY_1] v2 [beta] to [some pilots] first.';
    expect(rehydrate(move, map, '[COMPANY_1]')).toBe(
      'Ship Kestrel Labs v2 [beta] to [some pilots] first.',
    );
  });

  it('blocks a planted leak in egress-guard both directly and through router.run', async () => {
    const map = buildMap(
      [],
      [
        { text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'PulseAudit', type: 'PRODUCT', detectedBy: 'ai' },
      ],
    );
    setVaultEntries(map, 'game-1');

    expect(() =>
      assertClean('Player move: [COMPANY_1] launches [PRODUCT_1].', 'game-1'),
    ).not.toThrow();

    expect(() =>
      assertClean('Player move: kestrel labs launches [PRODUCT_1].', 'game-1'),
    ).toThrow(/Egress blocked/);

    await expect(
      run(
        'crowd',
        {
          situation: 'Testing startup plan.',
          userHeadline: 'We launch PulseAudit next week.',
          generalHeadlines: [],
          personas: [{ id: 'p1', label: 'Lead', outlook: 'Busy' }],
        },
        { gameId: 'game-1' },
      ),
    ).rejects.toMatchObject({
      name: 'AiError',
      code: 'egress_blocked',
      task: 'crowd',
    });
  });

  it('blocks leaked fetch payloads to firebasevertexai and firestore in net-guard', async () => {
    let networkHitCount = 0;
    globalThis.fetch = (async () => {
      networkHitCount++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    installNetGuard();

    const map = buildMap(
      [],
      [{ text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' }],
    );
    setVaultEntries(map);

    // 1. Clean cloud AI payload passes through
    await expect(
      globalThis.fetch(
        'https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: '[COMPANY_1] launches self-serve' }),
        },
      ),
    ).resolves.toBeDefined();
    expect(networkHitCount).toBe(1);

    // 2. Leaked vaulted original to firebasevertexai is blocked before hitting network
    await expect(
      globalThis.fetch(
        'https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: 'Kestrel Labs launches self-serve' }),
        },
      ),
    ).rejects.toBeInstanceOf(AiError);
    expect(networkHitCount).toBe(1);

    // 3. Multi-line raw text currently being sealed is blocked even when JSON.stringify escapes newlines
    const multiLineRawBrief = 'Objective: Undercut Globex in Lyon.\nBrief: Secret project Nightingale launches in Rabat with $2.4M ARR.';
    await expect(
      withSealingText(multiLineRawBrief, async () => {
        await globalThis.fetch(
          'https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent',
          {
            method: 'POST',
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: multiLineRawBrief }] }],
            }),
          },
        );
      }),
    ).rejects.toMatchObject({
      code: 'egress_blocked',
    });
    expect(networkHitCount).toBe(1);

    // 4. Non-string Blob body to a guarded host is blocked (fail closed)
    await expect(
      globalThis.fetch(
        'https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent',
        {
          method: 'POST',
          body: new Blob([JSON.stringify({ prompt: '[COMPANY_1] safe text' })], {
            type: 'application/json',
          }),
        },
      ),
    ).rejects.toMatchObject({
      code: 'egress_blocked',
    });
    expect(networkHitCount).toBe(1);

    // 5. Request object input with a leaked vaulted term is blocked
    const leakedRequest = new Request(
      'https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Kestrel Labs confidential move' }),
      },
    );
    await expect(globalThis.fetch(leakedRequest)).rejects.toMatchObject({
      code: 'egress_blocked',
    });
    expect(networkHitCount).toBe(1);
    expect(getNetGuardBlocks()).toHaveLength(4);
  });

  it('seals all 5 sample briefs with the on-device AI path (mock provider) with zero missed names or values', async () => {
    for (const brief of SAMPLE_BRIEFS) {
      mock.reset();
      mock.setHandler(async () => ({
        text: JSON.stringify({
          entities: brief.expectedNames.map((name) => ({
            text: name,
            type: 'COMPANY',
          })),
        }),
        inferenceSource: 'on_device',
      }));

      const result = await seal(brief.text);
      expect(result.method).toBe('on-device-ai');

      for (const name of brief.expectedNames) {
        expect(
          result.abstracted.toLowerCase(),
          `Expected name "${name}" to be redacted in brief "${brief.id}"`,
        ).not.toContain(name.toLowerCase());
      }

      for (const value of brief.expectedValues) {
        expect(
          result.abstracted,
          `Expected value "${value}" to be redacted in brief "${brief.id}"`,
        ).not.toContain(value);
      }

      expect(rehydrate(result.abstracted, result.map)).toBe(brief.text);
    }
  });

  it('seals all 5 sample briefs with the deterministic basic fallback when on-device AI is unavailable', async () => {
    setDeviceStatusForTest('unavailable', 0);
    delete (globalThis as Record<string, unknown>).LanguageModel;

    for (const brief of SAMPLE_BRIEFS) {
      const result = await seal(brief.text);
      expect(result.method).toBe('basic');

      for (const name of brief.expectedNames) {
        expect(
          result.abstracted.toLowerCase(),
          `Expected name "${name}" to be redacted by basic fallback in brief "${brief.id}"`,
        ).not.toContain(name.toLowerCase());
      }

      for (const value of brief.expectedValues) {
        expect(
          result.abstracted,
          `Expected value "${value}" to be redacted by basic fallback in brief "${brief.id}"`,
        ).not.toContain(value);
      }

      expect(rehydrate(result.abstracted, result.map)).toBe(brief.text);
    }

    expect(mock.calls).toHaveLength(0);
  });

  it('chunks long briefs without exceeding LIMITS.redactChunk or dropping characters', () => {
    const paragraph =
      'Kestrel Labs is expanding PulseAudit across Casablanca and Lyon with $240,000 ARR.\n\n';
    const longText = paragraph.repeat(40);
    const chunks = chunkText(longText, 1800);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1800);
    }
    expect(chunks.join('')).toBe(longText);
  });

  it('numbers tokens per type in order of first appearance in the text so the lead company is [COMPANY_1]', () => {
    const text =
      'Kestrel Labs is building a tool to compete with Zenith Logistics International and Atlas Cloud.';
    const map = buildMap(
      [],
      [
        { text: 'Zenith Logistics International', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Atlas Cloud', type: 'COMPANY', detectedBy: 'ai' },
        { text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' },
      ],
      [],
      text,
    );

    const kestrel = map.find((m) => m.original === 'Kestrel Labs')!;
    const zenith = map.find((m) => m.original === 'Zenith Logistics International')!;
    const atlas = map.find((m) => m.original === 'Atlas Cloud')!;

    expect(kestrel.token).toBe('[COMPANY_1]');
    expect(zenith.token).toBe('[COMPANY_2]');
    expect(atlas.token).toBe('[COMPANY_3]');
  });

  it('sets detectedBy to heuristic in detectCapitalisedRuns, defaults unknown proper nouns to OTHER and detects PERSON cues', () => {
    const text =
      'Kestrel Labs is building PulseAudit in Casablanca. Founder Amine Tazi and Ms. Sara Idrissi met with Sequoia regarding Project Falcon.';
    const entities = detectCapitalisedRuns(text);

    expect(entities.length).toBeGreaterThan(0);
    for (const ent of entities) {
      expect(ent.detectedBy).toBe('heuristic');
    }

    const byName = new Map(entities.map((e) => [e.text, e.type]));
    expect(byName.get('Kestrel Labs')).toBe('COMPANY');
    expect(byName.get('Amine Tazi')).toBe('PERSON');
    expect(byName.get('Sara Idrissi')).toBe('PERSON');
    expect(byName.get('Project Falcon')).toBe('PRODUCT');
    expect(byName.get('Casablanca')).toBe('OTHER');
    expect(byName.get('PulseAudit')).toBe('OTHER');
    expect(byName.get('Sequoia')).toBe('OTHER');
  });

  it('cleans em and en dashes via cleanPunctuation and inside rehydrate', () => {
    expect(cleanPunctuation('Threat level 1\u20135 and 10 \u2014 20 seats')).toBe(
      'Threat level 1-5 and 10-20 seats',
    );
    expect(
      cleanPunctuation(
        'Self-serve tier \u2014 fast to launch \u2013 fails without enterprise lock-in.',
      ),
    ).toBe('Self-serve tier, fast to launch, fails without enterprise lock-in.');

    const map = buildMap(
      [],
      [{ text: 'Kestrel Labs', type: 'COMPANY', detectedBy: 'ai' }],
    );
    expect(
      rehydrate(
        '[COMPANY_1] \u2014 rounds 1\u20133 \u2013 holds position.',
        map,
      ),
    ).toBe('Kestrel Labs, rounds 1-3, holds position.');
  });

  it('computes deterministic magnitude hints for MONEY and NUMBER entries and never includes the original value in the legend', async () => {
    expect(computeMagnitudeHint('$240,000', 'MONEY')).toBe('between $100K and $500K');
    expect(computeMagnitudeHint('€18.5M', 'MONEY')).toBe('between €5M and €25M');
    expect(computeMagnitudeHint('$49', 'MONEY')).toBe('under $100');
    expect(computeMagnitudeHint('45,000', 'NUMBER')).toBe('between 10K and 50K');
    expect(computeMagnitudeHint('420', 'NUMBER')).toBe('between 100 and 500');
    expect(computeMagnitudeHint('Kestrel Labs', 'COMPANY')).toBeUndefined();

    setDeviceStatusForTest('unavailable', 0);
    delete (globalThis as Record<string, unknown>).LanguageModel;

    for (const brief of SAMPLE_BRIEFS) {
      const sealed = await seal(brief.text);
      const legend = buildMagnitudeLegend(sealed.map);
      expect(legend.length).toBeGreaterThan(0);

      // Every enabled MONEY/NUMBER entry with a hint has a legend line by default,
      // and NO legend line ever contains any original vaulted value
      const enabledOriginals = sealed.map
        .filter((e) => e.enabled && e.original.trim().length >= 2)
        .map((e) => e.original.trim());

      for (const line of legend) {
        for (const orig of enabledOriginals) {
          const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
          expect(
            re.test(line),
            `Legend line "${line}" must never contain original value "${orig}"`,
          ).toBe(false);
        }
      }

      // Toggling hintEnabled = false removes that entry from the legend
      const firstMoney = sealed.map.find((e) => e.type === 'MONEY' && e.hint);
      if (firstMoney) {
        const toggledMap = sealed.map.map((e) =>
          e.token === firstMoney.token ? { ...e, hintEnabled: false } : e,
        );
        const reducedLegend = buildMagnitudeLegend(toggledMap);
        expect(
          reducedLegend.some((l) => l.startsWith(`${firstMoney.token}:`)),
        ).toBe(false);
      }
    }
  });

  it('drops email, URL, and phone entities returned by Nano so regex types them as CONTACT', async () => {
    const text =
      'Kestrel Labs contact: amine@kestrellabs.io, https://kestrellabs.io, +212 612-345-678.';
    mock.setHandler(async () => ({
      text: JSON.stringify({
        entities: [
          { text: 'Kestrel Labs', type: 'COMPANY' },
          { text: 'amine@kestrellabs.io', type: 'OTHER' },
          { text: 'https://kestrellabs.io', type: 'OTHER' },
          { text: '+212 612-345-678', type: 'OTHER' },
        ],
      }),
      inferenceSource: 'on_device',
    }));

    const result = await seal(text);
    expect(result.method).toBe('on-device-ai');

    const emailEntry = result.map.find((e) => e.original === 'amine@kestrellabs.io');
    const urlEntry = result.map.find((e) => e.original === 'https://kestrellabs.io');
    const phoneEntry = result.map.find((e) => e.original === '+212 612-345-678');

    expect(emailEntry?.type).toBe('CONTACT');
    expect(emailEntry?.detectedBy).toBe('regex');
    expect(urlEntry?.type).toBe('CONTACT');
    expect(urlEntry?.detectedBy).toBe('regex');
    expect(phoneEntry?.type).toBe('CONTACT');
    expect(phoneEntry?.detectedBy).toBe('regex');
  });
});
