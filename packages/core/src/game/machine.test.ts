import { describe, expect, it } from 'vitest';
import { setDeviceStatusForTest } from '../ai/device';
import { CANNED_OUTPUTS, createMockProvider } from '../ai/provider-mock';
import { setProvider, setRetrySleepForTest, type AiResult } from '../ai/router';
import { setUrlOverridesForTest } from '../ai/routing-table';
import type {
  CrowdOutput,
  FinalReportOutput,
  GeneralMoveOutput,
  RefereeRoundOutput,
  Task,
} from '../ai/schemas';
import type { PlaceholderEntry } from '../firewall/placeholders';
import {
  buildGeneralMoveInput,
  sanitizePromptText,
  selectRoundPersonas,
} from './compact';
import {
  clearRefereeLiveCache,
  resumePendingPhaseEffect,
  retrySingleGeneralEffect,
  runAftermathEffect,
  runFinalReportEffect,
  runPlayerMoveAndGeneralsEffect,
  runRefereeLiveEffect,
  runSealBriefEffect,
  runWhatIfEffect,
  undoMoveMaskedEntryEffect,
} from './engine';
import {
  createInitialGameRecord,
  formatGeneralsStatus,
  formatPhaseStatus,
  reduceGame,
} from './machine';
import {
  computeCrowdSentimentAverage,
  computeGeneralScores,
  formatPlayerVsGeneralScore,
} from './scoring';
import { startupTemplate } from './templates/startup';
import { priceWarTemplate } from './templates/price-war';
import { matchTemplate } from './templates/match';
import { TEMPLATE_LIST } from './templates';
import type { VaultRecord } from './types';

function makeAiResult<T>(
  task: Task,
  output: T,
  source: 'on-device' | 'cloud' = 'cloud',
): AiResult<T> {
  return {
    task,
    output,
    source,
    latencyMs: 500,
    model: source === 'on-device' ? 'gemini-nano' : 'gemini-3.5-flash-lite',
    fallback: false,
    repaired: false,
  };
}

describe('reduceGame state machine transitions', () => {
  it('walks through the full 3-round lifecycle from draft to done', () => {
    let state = createInitialGameRecord('game-1', 'startup', 1000);
    expect(state.phase).toEqual({ kind: 'draft' });

    state = reduceGame(
      state,
      {
        type: 'BRIEF_SUBMITTED',
        objective: 'Win seed',
        brief: 'Payflow in Lyon',
        templateId: 'startup',
      },
      1010,
    );
    expect(state.phase).toEqual({ kind: 'sealing_brief', progress: 0 });

    state = reduceGame(state, { type: 'SEAL_PROGRESS', progress: 0.5 }, 1015);
    expect(state.phase).toEqual({ kind: 'sealing_brief', progress: 0.5 });

    const map: PlaceholderEntry[] = [
      {
        token: '[COMPANY_1]',
        original: 'Payflow',
        aliases: [],
        type: 'COMPANY',
        detectedBy: 'heuristic',
        enabled: true,
      },
      {
        token: '[PLACE_1]',
        original: 'Lyon',
        aliases: [],
        type: 'PLACE',
        detectedBy: 'heuristic',
        enabled: true,
      },
    ];

    state = reduceGame(
      state,
      {
        type: 'BRIEF_SEALED',
        result: {
          abstracted: '[COMPANY_1] in [PLACE_1]',
          map,
          spans: [],
          method: 'basic',
        },
        abstractedObjective: 'Win seed',
        abstractedBrief: '[COMPANY_1] in [PLACE_1]',
      },
      1020,
    );
    expect(state.phase).toEqual({ kind: 'review' });
    expect(state.brief).toBe('[COMPANY_1] in [PLACE_1]');

    // MAP_EDITED stays in review and updates abstracted text
    state = reduceGame(
      state,
      {
        type: 'MAP_EDITED',
        map,
        abstractedObjective: 'Win seed for [COMPANY_1]',
        abstractedBrief: '[COMPANY_1] operating in [PLACE_1]',
      },
      1025,
    );
    expect(state.phase).toEqual({ kind: 'review' });
    expect(state.brief).toBe('[COMPANY_1] operating in [PLACE_1]');

    // Approve redaction -> user_turn(1)
    state = reduceGame(state, { type: 'REDACTION_APPROVED' }, 1030);
    expect(state.phase).toEqual({ kind: 'user_turn', round: 1 });
    expect(formatPhaseStatus(state.phase, state.totalRounds)).toBe(
      'Your move, round 1 of 3',
    );

    // Play 3 rounds
    for (const round of [1, 2, 3]) {
      state = reduceGame(
        state,
        { type: 'MOVE_SUBMITTED', text: `Round ${round} move for Payflow` },
        1100 + round,
      );
      expect(state.phase).toEqual({ kind: 'sealing_move', round });

      state = reduceGame(
        state,
        {
          type: 'MOVE_SEALED',
          abstracted: `Round ${round} move for [COMPANY_1]`,
          newEntries: [],
        },
        1200 + round,
      );
      expect(state.phase).toEqual({
        kind: 'generals',
        round,
        pending: ['vc', 'copycat', 'market'],
      });

      const genResult = makeAiResult<GeneralMoveOutput>(
        'general_move',
        CANNED_OUTPUTS.general_move,
        'cloud',
      );

      state = reduceGame(
        state,
        { type: 'GENERAL_MOVED', generalId: 'vc', result: genResult },
        1300 + round,
      );
      expect(state.phase).toEqual({
        kind: 'generals',
        round,
        pending: ['copycat', 'market'],
      });

      state = reduceGame(
        state,
        { type: 'GENERAL_MOVED', generalId: 'copycat', result: genResult },
        1310 + round,
      );
      expect(state.phase).toEqual({
        kind: 'generals',
        round,
        pending: ['market'],
      });

      state = reduceGame(
        state,
        { type: 'GENERAL_MOVED', generalId: 'market', result: genResult },
        1320 + round,
      );
      expect(state.phase).toEqual({
        kind: 'aftermath',
        round,
        referee: 'running',
        crowd: 'running',
      });

      state = reduceGame(
        state,
        {
          type: 'CROWD_REACTED',
          result: makeAiResult<CrowdOutput>('crowd', CANNED_OUTPUTS.crowd, 'on-device'),
        },
        1400 + round,
      );
      state = reduceGame(state, { type: 'CROWD_FINISHED' }, 1405 + round);
      expect(state.phase).toEqual({
        kind: 'aftermath',
        round,
        referee: 'running',
        crowd: 'done',
      });

      // NEXT is blocked while referee === 'running'
      expect(reduceGame(state, { type: 'NEXT' }).phase).toEqual(state.phase);

      state = reduceGame(
        state,
        {
          type: 'REFEREE_RULED',
          result: makeAiResult<RefereeRoundOutput>(
            'referee_round',
            CANNED_OUTPUTS.referee_round,
            'on-device',
          ),
        },
        1410 + round,
      );
      expect(state.phase).toEqual({
        kind: 'aftermath',
        round,
        referee: 'done',
        crowd: 'done',
      });

      state = reduceGame(state, { type: 'NEXT' }, 1420 + round);
      if (round < 3) {
        expect(state.phase).toEqual({ kind: 'user_turn', round: round + 1 });
      } else {
        expect(state.phase).toEqual({ kind: 'reporting' });
      }
    }

    state = reduceGame(
      state,
      {
        type: 'REPORT_READY',
        result: makeAiResult<FinalReportOutput>('final_report', CANNED_OUTPUTS.final_report, 'cloud'),
      },
      2000,
    );
    expect(state.phase).toEqual({ kind: 'done' });
    expect(state.report?.verdictLine).toContain('[COMPANY_1]');
  });

  it('handles partial General failure without failing the round and supports RETRY_GENERAL', () => {
    let state = createInitialGameRecord('game-partial', 'startup', 1000);
    state = reduceGame(state, {
      type: 'BRIEF_SUBMITTED',
      objective: 'Obj',
      brief: 'Brief',
      templateId: 'startup',
    });
    state = reduceGame(state, {
      type: 'BRIEF_SEALED',
      result: { abstracted: 'Brief', map: [], spans: [], method: 'basic' },
      abstractedObjective: 'Obj',
      abstractedBrief: 'Brief',
    });
    state = reduceGame(state, { type: 'REDACTION_APPROVED' });
    state = reduceGame(state, { type: 'MOVE_SUBMITTED', text: 'Move 1' });
    state = reduceGame(state, {
      type: 'MOVE_SEALED',
      abstracted: 'Move 1',
      newEntries: [],
    });

    const genResult = makeAiResult<GeneralMoveOutput>(
      'general_move',
      CANNED_OUTPUTS.general_move,
      'cloud',
    );

    // Two Generals succeed, one fails -> round does NOT block, transitions to aftermath with failedGenerals
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'vc', result: genResult });
    state = reduceGame(state, {
      type: 'GENERAL_FAILED',
      generalId: 'copycat',
      code: 'cloud_unavailable',
    });
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'market', result: genResult });

    expect(state.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'running',
      crowd: 'running',
      failedGenerals: { copycat: 'cloud_unavailable' },
    });

    // User clicks retry on the failed General card while in aftermath
    state = reduceGame(state, { type: 'RETRY_GENERAL', generalId: 'copycat' });
    expect(state.phase).toEqual({
      kind: 'generals',
      round: 1,
      pending: ['copycat'],
    });

    // Retry succeeds -> moves back to aftermath with failedGenerals cleared
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'copycat', result: genResult });
    expect(state.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'running',
      crowd: 'running',
    });

    // REFEREE_SKIPPED + NEXT advances to round 2 even if crowd is still running
    state = reduceGame(state, { type: 'REFEREE_SKIPPED' });
    state = reduceGame(state, { type: 'NEXT' });
    expect(state.phase).toEqual({ kind: 'user_turn', round: 2 });
  });

  it('transitions to failed from any async phase and RETRY restores the previous phase', () => {
    const asyncPhases = [
      { kind: 'sealing_brief' as const, progress: 0.4 },
      { kind: 'sealing_move' as const, round: 1 },
      { kind: 'generals' as const, round: 1, pending: ['vc'] },
      { kind: 'aftermath' as const, round: 1, referee: 'running' as const, crowd: 'done' as const },
      { kind: 'reporting' as const },
    ];

    for (const phase of asyncPhases) {
      const base = {
        ...createInitialGameRecord('game-fail', 'startup', 1000),
        phase,
      };
      const failedState = reduceGame(base, { type: 'FAILED', code: 'cloud_unavailable' }, 1500);
      expect(failedState.phase).toEqual({
        kind: 'failed',
        at: phase,
        code: 'cloud_unavailable',
      });

      const retriedState = reduceGame(failedState, { type: 'RETRY' }, 1600);
      expect(retriedState.phase).toEqual(phase);
    }
  });
});

describe('compact.ts and scoring.ts', () => {
  it('runs applyMap over everything placed in prompts including Generals earlier replies', () => {
    const map: PlaceholderEntry[] = [
      {
        token: '[COMPANY_1]',
        original: 'AcmeCorp',
        aliases: [],
        type: 'COMPANY',
        detectedBy: 'heuristic',
        enabled: true,
      },
      {
        token: '[PERSON_1]',
        original: 'Nadia Benali',
        aliases: [],
        type: 'PERSON',
        detectedBy: 'heuristic',
        enabled: true,
      },
    ];

    let state = createInitialGameRecord('game-compact', 'startup', 1000);
    state = reduceGame(state, {
      type: 'BRIEF_SUBMITTED',
      objective: 'Win',
      brief: 'AcmeCorp by Nadia Benali',
      templateId: 'startup',
    });
    state = reduceGame(state, {
      type: 'BRIEF_SEALED',
      result: { abstracted: '[COMPANY_1] by [PERSON_1]', map, spans: [], method: 'basic' },
      abstractedObjective: 'Win for AcmeCorp',
      abstractedBrief: '[COMPANY_1] by [PERSON_1]',
    });
    state = reduceGame(state, { type: 'REDACTION_APPROVED' });
    state = reduceGame(state, { type: 'MOVE_SUBMITTED', text: 'Move 1' });
    state = reduceGame(state, {
      type: 'MOVE_SEALED',
      abstracted: 'Move 1 for AcmeCorp',
      newEntries: [],
    });

    // Suppose an earlier General reply accidentally echoed "AcmeCorp" or "Nadia Benali"
    const leakyGen = makeAiResult<GeneralMoveOutput>(
      'general_move',
      {
        ...CANNED_OUTPUTS.general_move,
        headline: 'AcmeCorp burn rate is too high',
        move: 'Nadia Benali cannot hire fast enough at AcmeCorp.',
      },
      'cloud',
    );
    const cleanGen = makeAiResult<GeneralMoveOutput>(
      'general_move',
      CANNED_OUTPUTS.general_move,
      'cloud',
    );

    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'vc', result: leakyGen });
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'copycat', result: cleanGen });
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'market', result: cleanGen });
    state = reduceGame(state, { type: 'REFEREE_SKIPPED' });
    state = reduceGame(state, { type: 'NEXT' });

    const input = buildGeneralMoveInput(
      state,
      startupTemplate.generals[0]!,
      2,
      'Round 2 move for AcmeCorp and Nadia Benali',
      map,
    );
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('AcmeCorp');
    expect(serialized).not.toContain('Nadia Benali');
    expect(serialized).toContain('[COMPANY_1]');
    expect(serialized).toContain('[PERSON_1]');
    expect(sanitizePromptText('Hello AcmeCorp', map)).toBe('Hello [COMPANY_1]');
  });

  it('computes General scores clamped to -6..+6 and Crowd sentiment averages', () => {
    const state = createInitialGameRecord('game-score', 'startup', 1000);
    state.rounds = [
      {
        n: 1,
        userMove: 'Move 1',
        generalMoves: [
          {
            ...CANNED_OUTPUTS.general_move,
            generalId: 'vc',
            threatLevel: 4,
            source: 'cloud',
            latencyMs: 400,
            model: 'gemini-3.5-flash-lite',
            fallback: false,
          },
        ],
        crowd: [
          {
            personaId: 'p1',
            quote: 'Good',
            sentiment: 2,
            source: 'on-device',
            latencyMs: 100,
            model: 'gemini-nano',
            fallback: false,
          },
          {
            personaId: 'p2',
            quote: 'Mixed',
            sentiment: -1,
            source: 'on-device',
            latencyMs: 100,
            model: 'gemini-nano',
            fallback: false,
          },
        ],
        referee: {
          ...CANNED_OUTPUTS.referee_round,
          scores: [
            { generalId: 'vc', delta: 2 },
            { generalId: 'copycat', delta: -1 },
            { generalId: 'market', delta: 1 },
          ],
          source: 'on-device',
          latencyMs: 200,
          model: 'gemini-nano',
          fallback: false,
        },
      },
    ];
    const scores = computeGeneralScores(state.generals, state.rounds);
    expect(scores.find((s) => s.generalId === 'vc')?.score).toBe(2);
    expect(scores.find((s) => s.generalId === 'vc')?.latestThreatLevel).toBe(4);
    expect(computeCrowdSentimentAverage(state.rounds[0]!.crowd)).toBe(0.5);
    expect(formatPlayerVsGeneralScore('Copycat Competitor', -3)).toBe(
      'You vs Copycat Competitor: −3 (they lead)',
    );
    expect(formatPlayerVsGeneralScore('Skeptical VC', 2)).toBe(
      'You vs Skeptical VC: +2 (you lead)',
    );
    expect(formatPlayerVsGeneralScore('The Market', 0)).toBe(
      'You vs The Market: 0 (even)',
    );
  });
});

describe('engine.ts parallel Generals and retry effects', () => {
  it('runs 3 Generals in parallel and retries a failed General individually', async () => {
    const provider = createMockProvider();
    let copycatAttempts = 0;
    setRetrySleepForTest(async () => {});
    setDeviceStatusForTest('unavailable', 0);

    provider.setHandler((params) => {
      if (params.task === 'general_move') {
        // Fail Copycat Competitor on its first run (initial + 3 same-model retries + fallback = 5 attempts)
        if (params.system.includes('You are Copycat Competitor')) {
          copycatAttempts += 1;
          if (copycatAttempts <= 5) {
            const err = new Error('503 Service Unavailable');
            (err as Error & { status?: number }).status = 503;
            throw err;
          }
        }
        return {
          text: JSON.stringify(CANNED_OUTPUTS.general_move),
          inferenceSource: 'in_cloud',
        };
      }
      return {
        text: JSON.stringify(CANNED_OUTPUTS[params.task]),
        inferenceSource:
          params.mode === 'only_on_device' || params.mode === 'prefer_on_device'
            ? 'on_device'
            : 'in_cloud',
      };
    });

    setProvider(provider);

    let game = createInitialGameRecord('game-engine', 'startup', 1000);
    game.totalRounds = 1;
    let vaultRecord: VaultRecord = {
      gameId: game.id,
      rawObjective: '',
      rawBrief: '',
      rawMoves: {},
      map: [],
    };

    const sealed = await runSealBriefEffect(
      game,
      vaultRecord,
      'Reach $1M ARR in 12 months',
      'Payflow builds billing for €50k ARR',
    );
    game = sealed.game;
    vaultRecord = sealed.vaultRecord;
    expect(game.phase.kind).toBe('review');

    game = reduceGame(game, { type: 'REDACTION_APPROVED' });
    expect(game.phase).toEqual({ kind: 'user_turn', round: 1 });

    const moved = await runPlayerMoveAndGeneralsEffect(
      game,
      vaultRecord,
      'Launch enterprise tier',
    );
    game = moved.game;
    vaultRecord = moved.vaultRecord;

    // 2 Generals succeeded, 1 failed -> transitions straight to aftermath without blocking
    expect(game.phase.kind).toBe('aftermath');
    expect(game.rounds[0]?.generalMoves).toHaveLength(2);
    expect(game.rounds[0]?.failedGenerals).toEqual({
      copycat: 'cloud_unavailable',
    });

    // Referee and crowd run on the 2 replies that exist
    const afterPartial = await runAftermathEffect(game, vaultRecord);
    game = afterPartial.game;
    expect(game.rounds[0]?.referee).not.toBeNull();
    expect(game.rounds[0]?.crowd.length).toBeGreaterThanOrEqual(1);
    expect(
      formatGeneralsStatus(
        game.generals.length,
        game.rounds[0]?.generalMoves.length ?? 0,
        Object.keys(game.rounds[0]?.failedGenerals ?? {}).length,
        0,
      ),
    ).toBe('2 of 3 replied, 1 failed');

    // Optional Retry on the failed General still works from aftermath
    const retried = await retrySingleGeneralEffect(game, vaultRecord, 'copycat');
    game = retried.game;
    vaultRecord = retried.vaultRecord;
    expect(game.rounds[0]?.generalMoves).toHaveLength(3);
    expect(game.rounds[0]?.failedGenerals).toBeUndefined();

    const after = await runAftermathEffect(game, vaultRecord);
    game = after.game;
    expect(game.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'done',
      crowd: 'done',
    });

    game = reduceGame(game, { type: 'NEXT' });
    expect(game.phase).toEqual({ kind: 'reporting' });

    const reported = await runFinalReportEffect(game, vaultRecord);
    game = reported.game;
    expect(game.phase).toEqual({ kind: 'done' });
    expect(game.report?.verdict).toBe('holds_with_changes');
  });

  it('batches 5 rotating crowd personas per round in one on-device call and allows NEXT while crowd is still running', async () => {
    const r1 = selectRoundPersonas(startupTemplate.crowd, 1, 5);
    const r2 = selectRoundPersonas(startupTemplate.crowd, 2, 5);
    const r3 = selectRoundPersonas(startupTemplate.crowd, 3, 5);

    expect(r1.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(r2.map((p) => p.id)).toEqual(['p6', 'p7', 'p8', 'p9', 'p10']);
    expect(r3.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);

    const provider = createMockProvider();
    setProvider(provider);
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);

    let game = createInitialGameRecord('game-crowd-rot', 'startup', 1000);
    let vaultRecord: VaultRecord = {
      gameId: game.id,
      rawObjective: 'Reach $1M ARR',
      rawBrief: 'Kestrel Labs builds PulseAudit in Lyon.',
      rawMoves: {},
      map: [],
    };
    game = reduceGame(game, {
      type: 'BRIEF_SUBMITTED',
      objective: vaultRecord.rawObjective,
      brief: vaultRecord.rawBrief,
      templateId: 'startup',
    });
    game = reduceGame(game, {
      type: 'BRIEF_SEALED',
      result: { abstracted: vaultRecord.rawBrief, map: [], spans: [], method: 'basic' },
      abstractedObjective: vaultRecord.rawObjective,
      abstractedBrief: vaultRecord.rawBrief,
    });
    game = reduceGame(game, { type: 'REDACTION_APPROVED' });

    // Round 1 moves + aftermath
    const r1Moved = await runPlayerMoveAndGeneralsEffect(game, vaultRecord, 'Launch self-serve');
    game = r1Moved.game;
    vaultRecord = r1Moved.vaultRecord;

    // Verify NEXT works in reducer as soon as referee is done even while crowd === 'running'
    const midAftermath = reduceGame(game, {
      type: 'REFEREE_RULED',
      result: makeAiResult('referee_round', CANNED_OUTPUTS.referee_round, 'on-device'),
    });
    expect(midAftermath.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'done',
      crowd: 'running',
    });
    const advancedWhileCrowdRunning = reduceGame(midAftermath, { type: 'NEXT' });
    expect(advancedWhileCrowdRunning.phase).toEqual({ kind: 'user_turn', round: 2 });

    // Full aftermath run verifies 1 batched crowd call of 5 rotating personas per round
    const r1After = await runAftermathEffect(game, vaultRecord);
    game = r1After.game;
    expect(game.rounds[0]?.crowd.map((c) => c.personaId)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    expect(game.rounds[0]?.crowd.every((c) => c.source === 'on-device')).toBe(true);
    expect(game.rounds[0]?.referee?.source).toBe('on-device');

    game = reduceGame(game, { type: 'NEXT' });
    const r2Moved = await runPlayerMoveAndGeneralsEffect(game, vaultRecord, 'Expand enterprise');
    const r2After = await runAftermathEffect(r2Moved.game, r2Moved.vaultRecord);
    expect(r2After.game.rounds[1]?.crowd.map((c) => c.personaId)).toEqual([
      'p6',
      'p7',
      'p8',
      'p9',
      'p10',
    ]);

    const crowdCalls = provider.calls.filter((c) => c.params.task === 'crowd');
    expect(crowdCalls).toHaveLength(2);
    expect(crowdCalls[0]?.params.schemaIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(crowdCalls[1]?.params.schemaIds).toEqual(['p6', 'p7', 'p8', 'p9', 'p10']);
  });

  it('detects planted contradictions in both referee_round and referee_live against recorded commitments', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    setUrlOverridesForTest(null);
    clearRefereeLiveCache();
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);

    provider.setHandler((params, userPrompt) => {
      if (params.task === 'referee_round') {
        const hasNoPriceCutCommitment = userPrompt.includes('No price cuts before Q3');
        const cutsPriceInMove = userPrompt.toLowerCase().includes('cut prices by');
        return {
          text: JSON.stringify({
            summary: 'Round evaluated by on-device referee.',
            scores: [
              { generalId: 'vc', delta: cutsPriceInMove ? -2 : 1 },
              { generalId: 'copycat', delta: 0 },
              { generalId: 'market', delta: 1 },
            ],
            contradiction:
              hasNoPriceCutCommitment && cutsPriceInMove
                ? 'Player promised "No price cuts before Q3" in Round 1 but cut prices by 40% in Q1.'
                : 'Spurious contradiction when no commitments exist',
            commitments: hasNoPriceCutCommitment ? [] : ['No price cuts before Q3'],
          }),
          inferenceSource: 'on_device',
        };
      }
      if (params.task === 'referee_live') {
        const breaksPricePromise = userPrompt.toLowerCase().includes('cut prices by 40%');
        return {
          text: JSON.stringify({
            clarity: 4,
            risk: breaksPricePromise ? 'high' : 'low',
            tip: 'Specify how margin holds after the change.',
            contradicts: breaksPricePromise
              ? 'No price cuts before Q3'
              : 'Invented non-existent commitment',
          }),
          inferenceSource: 'on_device',
        };
      }
      return {
        text: JSON.stringify(CANNED_OUTPUTS[params.task]),
        inferenceSource: 'in_cloud',
      };
    });

    let game = createInitialGameRecord('game-contradiction', 'startup', 1000);
    let vaultRecord: VaultRecord = {
      gameId: game.id,
      rawObjective: 'Reach 1,000 teams',
      rawBrief: 'Kestrel Labs builds PulseAudit.',
      rawMoves: {},
      map: [],
    };
    game = reduceGame(game, {
      type: 'BRIEF_SUBMITTED',
      objective: vaultRecord.rawObjective,
      brief: vaultRecord.rawBrief,
      templateId: 'startup',
    });
    game = reduceGame(game, {
      type: 'BRIEF_SEALED',
      result: { abstracted: vaultRecord.rawBrief, map: [], spans: [], method: 'basic' },
      abstractedObjective: vaultRecord.rawObjective,
      abstractedBrief: vaultRecord.rawBrief,
    });
    game = reduceGame(game, { type: 'REDACTION_APPROVED' });

    // Round 1: no earlier commitments exist yet, so any stray contradiction from Nano is normalized to ""
    // and the new commitment "No price cuts before Q3" is recorded.
    const r1Moved = await runPlayerMoveAndGeneralsEffect(
      game,
      vaultRecord,
      'Hold self-serve price firm with no price cuts before Q3.',
    );
    const r1After = await runAftermathEffect(r1Moved.game, r1Moved.vaultRecord);
    game = r1After.game;
    vaultRecord = r1After.vaultRecord;

    expect(game.rounds[0]?.referee?.contradiction).toBe('');
    expect(game.commitments).toEqual(['No price cuts before Q3']);

    // Advance to Round 2
    game = reduceGame(game, { type: 'NEXT' });

    // Live referee coaching on a compliant draft drops hallucinated contradicts that don't match game.commitments
    const compliantLive = await runRefereeLiveEffect(
      game,
      'Expand annual pre-paid team plans and ship automated SOC2 audit connectors for design partners.',
    );
    expect(compliantLive?.source).toBe('on-device');
    expect(compliantLive?.output.contradicts).toBe('');

    // Live referee coaching on a draft with a planted contradiction flags the exact recorded commitment
    const contradictingDraft =
      'We will cut prices by 40% immediately in Q1 across all self-serve tiers to undercut Copycat.';
    const contradictingLive = await runRefereeLiveEffect(game, contradictingDraft);
    expect(contradictingLive?.source).toBe('on-device');
    expect(contradictingLive?.output.risk).toBe('high');
    expect(contradictingLive?.output.contradicts).toBe('No price cuts before Q3');

    // Submitting the contradicting move in Round 2 causes referee_round to flag the contradiction
    const r2Moved = await runPlayerMoveAndGeneralsEffect(
      game,
      vaultRecord,
      contradictingDraft,
    );
    const r2After = await runAftermathEffect(r2Moved.game, r2Moved.vaultRecord);
    expect(r2After.game.rounds[1]?.referee?.contradiction).toContain(
      'No price cuts before Q3',
    );
    expect(r2After.game.rounds[1]?.referee?.scores.find((s) => s.generalId === 'vc')?.delta).toBe(
      -2,
    );
  });

  it('replaces known entities in moves, records new entities as chips, and supports undoing a chip', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    // Use deterministic redaction so entity extraction is exact and fast
    setDeviceStatusForTest('unavailable', 0);

    let game = createInitialGameRecord('game-move-chips', 'startup', 1000);
    let vaultRecord: VaultRecord = {
      gameId: game.id,
      rawObjective: '',
      rawBrief: '',
      rawMoves: {},
      map: [],
    };

    const sealed = await runSealBriefEffect(
      game,
      vaultRecord,
      'Reach 500 customers for Kestrel Labs.',
      'We build workflow auditing tools for Kestrel Labs.',
    );
    game = reduceGame(sealed.game, { type: 'REDACTION_APPROVED' });
    vaultRecord = sealed.vaultRecord;

    const kestrelEntry = vaultRecord.map.find((e) => e.original === 'Kestrel Labs');
    expect(kestrelEntry).toBeDefined();

    // Player move mentions known "Kestrel Labs" plus new entities "Zenith Corp" and "$75,000"
    const moved = await runPlayerMoveAndGeneralsEffect(
      game,
      vaultRecord,
      'Kestrel Labs signs Zenith Corp for $75,000 annual contract.',
    );
    game = moved.game;
    vaultRecord = moved.vaultRecord;

    const round1 = game.rounds[0]!;
    // Known entity Kestrel Labs was replaced with its existing token and NOT listed in newEntries
    expect(round1.userMove).toContain(kestrelEntry!.token);
    expect(round1.newEntries?.some((e) => e.token === kestrelEntry!.token)).toBe(false);
    // New entities were masked and recorded in round1.newEntries (for chips)
    const newTokens = (round1.newEntries ?? []).map((e) => e.token);
    expect(newTokens.length).toBeGreaterThanOrEqual(2);
    const moneyChip = round1.newEntries?.find((e) => e.original === '$75,000');
    expect(moneyChip).toBeDefined();
    expect(round1.userMove).toContain(moneyChip!.token);

    // Undo the $75,000 chip -> restores "$75,000" in userMove and removes the chip
    const undone = await undoMoveMaskedEntryEffect(
      game,
      vaultRecord,
      1,
      moneyChip!.token,
    );
    expect(undone.game.rounds[0]?.userMove).toContain('$75,000');
    expect(undone.game.rounds[0]?.userMove).toContain(kestrelEntry!.token);
    expect(
      undone.game.rounds[0]?.newEntries?.some((e) => e.token === moneyChip!.token),
    ).toBe(false);
  });

  it('resumes pending work or marks failed with Retry after reload for sealing_move, generals, aftermath, and reporting', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    setRetrySleepForTest(async () => {});
    setDeviceStatusForTest('unavailable', 0);

    const baseGame = createInitialGameRecord('game-resume', 'startup', 1000);
    const baseVault: VaultRecord = {
      gameId: baseGame.id,
      rawObjective: 'Reach 1,000 teams',
      rawBrief: 'Kestrel Labs builds PulseAudit.',
      rawMoves: {},
      map: [],
    };

    // 1. sealing_move without saved rawMove -> marks failed targeting user_turn(1) so Retry works
    const stuckSealingNoMove = {
      ...baseGame,
      phase: { kind: 'sealing_move' as const, round: 1 },
    };
    const res1 = await resumePendingPhaseEffect(stuckSealingNoMove, baseVault);
    expect(res1.game.phase).toEqual({
      kind: 'failed',
      at: { kind: 'user_turn', round: 1 },
      code: 'aborted',
    });
    expect(reduceGame(res1.game, { type: 'RETRY' }).phase).toEqual({
      kind: 'user_turn',
      round: 1,
    });

    // 2. sealing_move WITH saved rawMove -> seals and runs all 3 Generals to aftermath
    const vaultWithMove: VaultRecord = {
      ...baseVault,
      rawMoves: { 1: 'Launch self-serve tier' },
    };
    const res2 = await resumePendingPhaseEffect(stuckSealingNoMove, vaultWithMove);
    expect(res2.game.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'running',
      crowd: 'running',
    });
    expect(res2.game.rounds[0]?.generalMoves).toHaveLength(3);

    // 3. generals with 1 pending General -> runs only the 1 pending General
    provider.reset();
    const partialGeneralsGame = {
      ...res2.game,
      rounds: [
        {
          ...res2.game.rounds[0]!,
          generalMoves: res2.game.rounds[0]!.generalMoves.filter(
            (m) => m.generalId !== 'market',
          ),
        },
      ],
      phase: {
        kind: 'generals' as const,
        round: 1,
        pending: ['market'],
      },
    };
    const res3 = await resumePendingPhaseEffect(partialGeneralsGame, vaultWithMove);
    expect(res3.game.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'running',
      crowd: 'running',
    });
    expect(
      provider.calls.filter((c) => c.params.task === 'general_move'),
    ).toHaveLength(1);

    // 4. aftermath where referee is already done and only crowd is running -> runs only crowd
    provider.reset();
    const partialAftermathGame = {
      ...res3.game,
      phase: {
        kind: 'aftermath' as const,
        round: 1,
        referee: 'done' as const,
        crowd: 'running' as const,
      },
    };
    const res4 = await resumePendingPhaseEffect(partialAftermathGame, vaultWithMove);
    expect(res4.game.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'done',
      crowd: 'done',
    });
    expect(
      provider.calls.filter((c) => c.params.task === 'referee_round'),
    ).toHaveLength(0);
    expect(provider.calls.filter((c) => c.params.task === 'crowd')).toHaveLength(1);

    // 5. reporting -> runs final_report to done
    const reportingGame = {
      ...res4.game,
      phase: { kind: 'reporting' as const },
    };
    const res5 = await resumePendingPhaseEffect(reportingGame, vaultWithMove);
    expect(res5.game.phase).toEqual({ kind: 'done' });
    expect(res5.game.report).not.toBeNull();
  });

  it('runs offline What-If simulation strictly with only_on_device for crowd and referee_round against recorded General replies', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    setRetrySleepForTest(async () => {});
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);

    let game = createInitialGameRecord('game-whatif', 'startup', 1000);
    game.totalRounds = 1;
    let vaultRecord: VaultRecord = {
      gameId: game.id,
      rawObjective: 'Reach $1M ARR for Kestrel Labs.',
      rawBrief: 'Kestrel Labs builds workflow auditing tools in Lyon.',
      rawMoves: {},
      map: [],
    };

    const sealed = await runSealBriefEffect(
      game,
      vaultRecord,
      vaultRecord.rawObjective,
      vaultRecord.rawBrief,
    );
    game = reduceGame(sealed.game, { type: 'REDACTION_APPROVED' });
    vaultRecord = sealed.vaultRecord;

    const moved = await runPlayerMoveAndGeneralsEffect(
      game,
      vaultRecord,
      'Launch self-serve tier.',
    );
    const after = await runAftermathEffect(moved.game, moved.vaultRecord);
    const readyForReport = reduceGame(after.game, { type: 'NEXT' });
    const finished = await runFinalReportEffect(readyForReport, after.vaultRecord);
    game = finished.game;
    vaultRecord = finished.vaultRecord;
    expect(game.phase).toEqual({ kind: 'done' });

    // Clear provider call history before running offline What-If
    provider.reset();

    const whatIfRes = await runWhatIfEffect(
      game,
      vaultRecord,
      1,
      'Pivot Kestrel Labs to annual enterprise contracts in Lyon at $25,000/year.',
    );

    expect(whatIfRes.game.whatIfs).toHaveLength(1);
    const branch = whatIfRes.whatIf;
    expect(branch.round).toBe(1);
    // Raw names and $25,000 in the what-if move are masked locally
    expect(branch.userMove).not.toContain('Kestrel Labs');
    expect(branch.userMove).not.toContain('$25,000');
    expect(branch.crowd).toHaveLength(5);
    expect(branch.crowd.every((c) => c.source === 'on-device')).toBe(true);
    expect(branch.referee?.source).toBe('on-device');

    // Every call made during What-If (redact, referee_round, crowd) used mode: 'only_on_device'
    expect(provider.calls.length).toBeGreaterThanOrEqual(2);
    expect(provider.calls.every((c) => c.params.mode === 'only_on_device')).toBe(
      true,
    );
    expect(
      provider.calls.some((c) => c.params.task === 'general_move'),
    ).toBe(false);
  });

  it('defines distinct three Generals and ten crowd personas for startup, price-war, and match templates', () => {
    expect(TEMPLATE_LIST).toHaveLength(3);
    const generalIds = new Set<string>();
    const generalNames = new Set<string>();
    const crowdLabels = new Set<string>();

    for (const tpl of [startupTemplate, priceWarTemplate, matchTemplate]) {
      expect(tpl.generals).toHaveLength(3);
      expect(tpl.crowd).toHaveLength(10);

      for (const g of tpl.generals) {
        expect(generalIds.has(g.id)).toBe(false);
        expect(generalNames.has(g.name)).toBe(false);
        generalIds.add(g.id);
        generalNames.add(g.name);
        expect(g.persona.length).toBeGreaterThan(20);
        expect(g.goal.length).toBeGreaterThan(10);
        expect(g.hiddenInfo.length).toBeGreaterThan(10);
      }

      for (const c of tpl.crowd) {
        expect(crowdLabels.has(c.label)).toBe(false);
        crowdLabels.add(c.label);
        expect(c.outlook.length).toBeGreaterThan(10);
      }

      const initial = createInitialGameRecord(`test-${tpl.id}`, tpl.id, 1000);
      expect(initial.templateId).toBe(tpl.id);
      expect(initial.generals.map((g) => g.id)).toEqual(tpl.generals.map((g) => g.id));
      expect(tpl.demoObjective.length).toBeGreaterThan(20);
      expect(tpl.demoBrief.length).toBeGreaterThan(200);
    }
  });

  it('plays a full 3-round mock game to final report on startup, price-war, and match templates', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    setRetrySleepForTest(async () => {});
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: async () => 'available',
    };
    setDeviceStatusForTest('available', 1);

    for (const tpl of [startupTemplate, priceWarTemplate, matchTemplate]) {
      let game = createInitialGameRecord(`full-${tpl.id}`, tpl.id, 1000);
      let vaultRecord: VaultRecord = {
        gameId: game.id,
        rawObjective: '',
        rawBrief: '',
        rawMoves: {},
        map: [],
      };

      const sealed = await runSealBriefEffect(
        game,
        vaultRecord,
        tpl.demoObjective,
        tpl.demoBrief,
      );
      game = reduceGame(sealed.game, { type: 'REDACTION_APPROVED' });
      vaultRecord = sealed.vaultRecord;
      expect(vaultRecord.map.length).toBeGreaterThanOrEqual(8);

      for (const round of [1, 2, 3]) {
        expect(game.phase).toEqual({ kind: 'user_turn', round });
        const moved = await runPlayerMoveAndGeneralsEffect(
          game,
          vaultRecord,
          `${tpl.openingMove} (Round ${round})`,
        );
        const after = await runAftermathEffect(moved.game, moved.vaultRecord);
        game = after.game;
        vaultRecord = after.vaultRecord;

        expect(game.rounds[round - 1]?.generalMoves).toHaveLength(3);
        expect(
          game.rounds[round - 1]?.generalMoves.map((m) => m.generalId),
        ).toEqual(tpl.generals.map((g) => g.id));
        expect(game.rounds[round - 1]?.crowd).toHaveLength(5);
        expect(game.rounds[round - 1]?.referee?.scores).toHaveLength(3);
        expect(
          game.rounds[round - 1]?.referee?.scores.map((s) => s.generalId),
        ).toEqual(tpl.generals.map((g) => g.id));

        game = reduceGame(game, { type: 'NEXT' });
      }

      expect(game.phase).toEqual({ kind: 'reporting' });
      const finalRes = await runFinalReportEffect(game, vaultRecord);
      expect(finalRes.game.phase).toEqual({ kind: 'done' });
      expect(finalRes.game.report).not.toBeNull();
    }
  });

  it('survives Day 12 failure drills: mid-round network loss, invalid JSON twice on a General, and 429 rate limits across three back-to-back games', async () => {
    const provider = createMockProvider();
    setProvider(provider);
    const sleepLog: number[] = [];
    setRetrySleepForTest(async (ms) => {
      sleepLog.push(ms);
    });
    // Start with device unavailable so cloud failures surface cleanly
    setDeviceStatusForTest('unavailable', 0);
    delete (globalThis as Record<string, unknown>).LanguageModel;

    // Drill 1: Mid-round network drop (503 / fetch error) on all Generals during Round 1, then network recovers on Retry
    let networkDown = true;
    provider.setHandler((params) => {
      if (params.task === 'general_move' && networkDown) {
        throw new Error('AI: Error fetching from vertex: [503 ] Network disconnected (AI/fetch-error)');
      }
      return {
        text: JSON.stringify(CANNED_OUTPUTS[params.task]),
        inferenceSource: 'in_cloud',
      };
    });

    let drillGame = createInitialGameRecord('drill-net', 'startup', 1000);
    drillGame.totalRounds = 1;
    let drillVault: VaultRecord = {
      gameId: drillGame.id,
      rawObjective: '',
      rawBrief: '',
      rawMoves: {},
      map: [],
    };
    const sealed1 = await runSealBriefEffect(
      drillGame,
      drillVault,
      startupTemplate.demoObjective,
      startupTemplate.demoBrief,
    );
    drillGame = reduceGame(sealed1.game, { type: 'REDACTION_APPROVED' });
    drillVault = sealed1.vaultRecord;

    const failedMove = await runPlayerMoveAndGeneralsEffect(
      drillGame,
      drillVault,
      'Launch self-serve tier.',
    );
    drillGame = failedMove.game;
    drillVault = failedMove.vaultRecord;
    // All 3 Generals exhausted retries while network was down -> cards hold position with cloud_unavailable
    expect(drillGame.phase.kind).toBe('aftermath');
    expect(drillGame.rounds[0]?.generalMoves).toHaveLength(0);
    expect(Object.keys(drillGame.rounds[0]?.failedGenerals ?? {})).toHaveLength(3);

    // Network comes back -> user retries each General and completes aftermath
    networkDown = false;
    for (const gen of drillGame.generals) {
      const retried = await retrySingleGeneralEffect(drillGame, drillVault, gen.id);
      drillGame = retried.game;
      drillVault = retried.vaultRecord;
    }
    expect(drillGame.rounds[0]?.generalMoves).toHaveLength(3);
    expect(drillGame.rounds[0]?.failedGenerals).toBeUndefined();

    // Drill 2: One General returns invalid JSON twice (initial + repair retry -> invalid_json),
    // round continues without blocking on the other 2 Generals
    provider.setHandler((params) => {
      if (
        params.task === 'general_move' &&
        params.system.includes('You are Copycat Competitor')
      ) {
        return {
          text: '{"broken_json": true',
          inferenceSource: 'in_cloud',
        };
      }
      if (params.task === 'referee_round' && params.schemaIds) {
        return {
          text: JSON.stringify({
            ...CANNED_OUTPUTS.referee_round,
            scores: params.schemaIds.map((gid) => ({ generalId: gid, delta: 1 })),
          }),
          inferenceSource: 'in_cloud',
        };
      }
      if (params.task === 'crowd' && params.schemaIds) {
        return {
          text: JSON.stringify({
            reactions: params.schemaIds.map((pid) => ({
              personaId: pid,
              quote: 'Reaction under partial General failure.',
              sentiment: 1,
            })),
          }),
          inferenceSource: 'in_cloud',
        };
      }
      return {
        text: JSON.stringify(CANNED_OUTPUTS[params.task]),
        inferenceSource: 'in_cloud',
      };
    });

    let jsonDrillGame = createInitialGameRecord('drill-json', 'startup', 2000);
    jsonDrillGame.totalRounds = 1;
    let jsonDrillVault: VaultRecord = {
      gameId: jsonDrillGame.id,
      rawObjective: 'Win market',
      rawBrief: 'Kestrel Labs in Casablanca.',
      rawMoves: {},
      map: [],
    };
    const sealed2 = await runSealBriefEffect(
      jsonDrillGame,
      jsonDrillVault,
      jsonDrillVault.rawObjective,
      jsonDrillVault.rawBrief,
    );
    jsonDrillGame = reduceGame(sealed2.game, { type: 'REDACTION_APPROVED' });
    jsonDrillVault = sealed2.vaultRecord;

    const r1Json = await runPlayerMoveAndGeneralsEffect(
      jsonDrillGame,
      jsonDrillVault,
      'Ship self-serve tier.',
    );
    expect(r1Json.game.rounds[0]?.generalMoves).toHaveLength(2);
    expect(r1Json.game.rounds[0]?.failedGenerals).toEqual({
      copycat: 'invalid_json',
    });
    const afterJson = await runAftermathEffect(r1Json.game, r1Json.vaultRecord);
    expect(afterJson.game.rounds[0]?.referee?.scores).toHaveLength(2);
    expect(afterJson.game.rounds[0]?.crowd).toHaveLength(5);

    // Drill 3: Hit 429 rate limits while running three games back to back (startup, price-war, match)
    sleepLog.length = 0;
    let callCounter = 0;
    provider.setHandler((params) => {
      callCounter += 1;
      // Every 4th call throws a 429 with retryDelay 5s (<= 20s) to exercise rate-limit recovery mid-game
      if (callCounter % 4 === 0) {
        throw new Error('429 Too Many Requests [{"retryDelay":"5s"}]');
      }
      if (params.task === 'referee_round' && params.schemaIds) {
        return {
          text: JSON.stringify({
            ...CANNED_OUTPUTS.referee_round,
            scores: params.schemaIds.map((gid) => ({ generalId: gid, delta: 1 })),
          }),
          inferenceSource: 'in_cloud',
        };
      }
      if (params.task === 'crowd' && params.schemaIds) {
        return {
          text: JSON.stringify({
            reactions: params.schemaIds.map((pid) => ({
              personaId: pid,
              quote: 'Recovered from rate limit.',
              sentiment: 1,
            })),
          }),
          inferenceSource: 'in_cloud',
        };
      }
      return {
        text: JSON.stringify(CANNED_OUTPUTS[params.task]),
        inferenceSource: 'in_cloud',
      };
    });

    for (const tpl of [startupTemplate, priceWarTemplate, matchTemplate]) {
      let g = createInitialGameRecord(`back-to-back-${tpl.id}`, tpl.id, 3000);
      g.totalRounds = 1;
      let v: VaultRecord = {
        gameId: g.id,
        rawObjective: '',
        rawBrief: '',
        rawMoves: {},
        map: [],
      };
      const s = await runSealBriefEffect(g, v, tpl.demoObjective, tpl.demoBrief);
      g = reduceGame(s.game, { type: 'REDACTION_APPROVED' });
      v = s.vaultRecord;

      const m = await runPlayerMoveAndGeneralsEffect(g, v, tpl.openingMove);
      const a = await runAftermathEffect(m.game, m.vaultRecord);
      const next = reduceGame(a.game, { type: 'NEXT' });
      const rep = await runFinalReportEffect(next, a.vaultRecord);

      expect(rep.game.phase).toEqual({ kind: 'done' });
      expect(rep.game.report).not.toBeNull();
    }
    expect(sleepLog.filter((ms) => ms === 5000).length).toBeGreaterThanOrEqual(3);
  });
});
