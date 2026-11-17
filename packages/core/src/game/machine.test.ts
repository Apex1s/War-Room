import { describe, expect, it } from 'vitest';
import { CANNED_OUTPUTS, createMockProvider } from '../ai/provider-mock';
import { setProvider, type AiResult } from '../ai/router';
import type {
  CrowdOutput,
  FinalReportOutput,
  GeneralMoveOutput,
  RefereeRoundOutput,
  Task,
} from '../ai/schemas';
import type { PlaceholderEntry } from '../firewall/placeholders';
import { buildGeneralMoveInput, sanitizePromptText } from './compact';
import {
  retrySingleGeneralEffect,
  runAftermathEffect,
  runFinalReportEffect,
  runPlayerMoveAndGeneralsEffect,
  runSealBriefEffect,
} from './engine';
import { createInitialGameRecord, reduceGame } from './machine';
import { computeCrowdSentimentAverage, computeGeneralScores } from './scoring';
import { startupTemplate } from './templates/startup';
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

    // Two Generals succeed, one fails
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'vc', result: genResult });
    state = reduceGame(state, {
      type: 'GENERAL_FAILED',
      generalId: 'copycat',
      code: 'cloud_unavailable',
    });
    state = reduceGame(state, { type: 'GENERAL_MOVED', generalId: 'market', result: genResult });

    // Round is still in 'generals' phase with failedGenerals recorded (not 'failed')
    expect(state.phase).toEqual({
      kind: 'generals',
      round: 1,
      pending: [],
      failedGenerals: { copycat: 'cloud_unavailable' },
    });

    // User clicks retry on the failed General card
    state = reduceGame(state, { type: 'RETRY_GENERAL', generalId: 'copycat' });
    expect(state.phase).toEqual({
      kind: 'generals',
      round: 1,
      pending: ['copycat'],
    });

    // Retry succeeds -> moves to aftermath
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
  });
});

describe('engine.ts parallel Generals and retry effects', () => {
  it('runs 3 Generals in parallel and retries a failed General individually', async () => {
    const provider = createMockProvider();
    let copycatAttempts = 0;

    provider.setHandler((params) => {
      if (params.task === 'general_move') {
        // Fail Copycat Competitor on its first run (primary + fallback = 2 attempts)
        if (params.system.includes('You are Copycat Competitor')) {
          copycatAttempts += 1;
          if (copycatAttempts <= 2) {
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

    // 2 Generals succeeded, 1 failed
    expect(game.phase.kind).toBe('generals');
    if (game.phase.kind === 'generals') {
      expect(game.phase.pending).toEqual([]);
      const failedIds = Object.keys(game.phase.failedGenerals ?? {});
      expect(failedIds.length).toBe(1);

      // Retry the failed General
      const retried = await retrySingleGeneralEffect(game, vaultRecord, failedIds[0]!);
      game = retried.game;
      vaultRecord = retried.vaultRecord;
    }

    expect(game.phase).toEqual({
      kind: 'aftermath',
      round: 1,
      referee: 'running',
      crowd: 'running',
    });

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
});
