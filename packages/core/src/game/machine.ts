import { TEMPLATES } from './templates';
import type { GameEvent, GameRecord, Phase, RoundRecord, TemplateId } from './types';

/**
 * Human-readable status string for the current game phase
 * (e.g. `"Your move, round 1 of 3"` instead of a raw debug phase label).
 */
export function formatPhaseStatus(phase: Phase, totalRounds: number = 3): string {
  switch (phase.kind) {
    case 'draft':
      return 'Drafting confidential brief';
    case 'sealing_brief':
      return 'Sealing brief on-device';
    case 'review':
      return 'Reviewing privacy firewall';
    case 'user_turn':
      return `Your move, round ${phase.round} of ${totalRounds}`;
    case 'sealing_move':
      return `Sealing your move, round ${phase.round} of ${totalRounds}`;
    case 'generals':
      return phase.pending.length > 0
        ? `Generals responding, round ${phase.round} of ${totalRounds}`
        : `General retry needed, round ${phase.round} of ${totalRounds}`;
    case 'aftermath':
      if (phase.referee === 'running') {
        return `Referee evaluating round ${phase.round} of ${totalRounds}`;
      }
      if (phase.crowd === 'running') {
        return `Round ${phase.round} of ${totalRounds} verdict ready (crowd reacting)`;
      }
      return `Round ${phase.round} of ${totalRounds} complete`;
    case 'reporting':
      return 'Writing final verdict report';
    case 'done':
      return 'Final report ready';
    case 'failed':
      return `Interrupted (${phase.code}), ready to retry`;
  }
}

/**
 * Honest status line for Generals in a round, counting replies and failures explicitly
 * (e.g. `"2 of 3 replied, 1 failed"`, never `"3/3 complete"` when one failed).
 */
export function formatGeneralsStatus(
  totalGenerals: number,
  repliedCount: number,
  failedCount: number,
  pendingCount: number = Math.max(0, totalGenerals - repliedCount - failedCount),
): string {
  if (failedCount > 0 && pendingCount > 0) {
    return `${repliedCount} of ${totalGenerals} replied, ${failedCount} failed, ${pendingCount} pending`;
  }
  if (failedCount > 0) {
    return `${repliedCount} of ${totalGenerals} replied, ${failedCount} failed`;
  }
  if (pendingCount > 0) {
    return `${repliedCount} of ${totalGenerals} replied, ${pendingCount} pending`;
  }
  return `${repliedCount} of ${totalGenerals} replied`;
}

export function createInitialGameRecord(
  id: string,
  templateId: TemplateId = 'startup',
  now: number = Date.now(),
): GameRecord {
  const tpl = TEMPLATES[templateId];
  return {
    id,
    schemaVersion: 1,
    templateId,
    objective: '',
    brief: '',
    redactionMethod: 'basic',
    generals: tpl.generals,
    crowd: tpl.crowd,
    totalRounds: 3,
    rounds: [],
    commitments: [],
    report: null,
    phase: { kind: 'draft' },
    whatIfs: [],
    createdAt: now,
    updatedAt: now,
    cloudSavedAt: null,
  };
}

function upsertRound(
  rounds: RoundRecord[],
  n: number,
  updater: (existing: RoundRecord) => RoundRecord,
): RoundRecord[] {
  const idx = rounds.findIndex((r) => r.n === n);
  if (idx === -1) {
    const fresh: RoundRecord = updater({
      n,
      userMove: '',
      generalMoves: [],
      crowd: [],
      referee: null,
    });
    return [...rounds, fresh].sort((a, b) => a.n - b.n);
  }
  return rounds.map((r, i) => (i === idx ? updater(r) : r));
}

function isAsyncPhase(phase: GameRecord['phase']): boolean {
  return (
    phase.kind === 'sealing_brief' ||
    phase.kind === 'sealing_move' ||
    phase.kind === 'generals' ||
    phase.kind === 'aftermath' ||
    phase.kind === 'reporting'
  );
}

/**
 * Pure state-machine reducer `(state, event) -> state` as specified in design doc §6.
 */
export function reduceGame(
  state: GameRecord,
  event: GameEvent,
  now: number = Date.now(),
): GameRecord {
  switch (event.type) {
    case 'BRIEF_SUBMITTED': {
      if (state.phase.kind !== 'draft' && state.phase.kind !== 'review') {
        return state;
      }
      const tpl = TEMPLATES[event.templateId];
      return {
        ...state,
        templateId: event.templateId,
        generals: tpl.generals,
        crowd: tpl.crowd,
        phase: { kind: 'sealing_brief', progress: 0 },
        updatedAt: now,
      };
    }

    case 'SEAL_PROGRESS': {
      if (state.phase.kind !== 'sealing_brief') return state;
      return {
        ...state,
        phase: { kind: 'sealing_brief', progress: event.progress },
        updatedAt: now,
      };
    }

    case 'BRIEF_SEALED': {
      if (state.phase.kind !== 'sealing_brief') return state;
      return {
        ...state,
        objective: event.abstractedObjective ?? state.objective,
        brief: event.abstractedBrief ?? event.result.abstracted,
        redactionMethod: event.result.method,
        phase: { kind: 'review' },
        updatedAt: now,
      };
    }

    case 'MAP_EDITED': {
      if (state.phase.kind !== 'review') return state;
      return {
        ...state,
        objective: event.abstractedObjective ?? state.objective,
        brief: event.abstractedBrief ?? state.brief,
        updatedAt: now,
      };
    }

    case 'REDACTION_APPROVED': {
      if (state.phase.kind !== 'review') return state;
      return {
        ...state,
        phase: { kind: 'user_turn', round: 1 },
        updatedAt: now,
      };
    }

    case 'MOVE_SUBMITTED': {
      if (state.phase.kind !== 'user_turn') return state;
      const round = state.phase.round;
      return {
        ...state,
        phase: { kind: 'sealing_move', round },
        updatedAt: now,
      };
    }

    case 'MOVE_SEALED': {
      if (state.phase.kind !== 'sealing_move') return state;
      const round = state.phase.round;
      const pending = state.generals.map((g) => g.id);
      const rounds = upsertRound(state.rounds, round, (r) => ({
        ...r,
        userMove: event.abstracted,
        newEntries: event.newEntries,
        generalMoves: [],
        crowd: [],
        referee: null,
      }));
      return {
        ...state,
        rounds,
        phase: { kind: 'generals', round, pending },
        updatedAt: now,
      };
    }

    case 'GENERAL_MOVED': {
      if (state.phase.kind !== 'generals') return state;
      const { round, pending, failedGenerals } = state.phase;
      const nextPending = pending.filter((id) => id !== event.generalId);
      const nextFailed = { ...(failedGenerals ?? {}) };
      delete nextFailed[event.generalId];
      const hasFailed = Object.keys(nextFailed).length > 0;

      const moveEntry = {
        ...event.result.output,
        generalId: event.generalId,
        source: event.result.source,
        latencyMs: event.result.latencyMs,
        model: event.result.model,
        fallback: event.result.fallback,
      };

      const rounds = upsertRound(state.rounds, round, (r) => {
        const filtered = r.generalMoves.filter((m) => m.generalId !== event.generalId);
        return {
          ...r,
          generalMoves: [...filtered, moveEntry],
          failedGenerals: hasFailed ? nextFailed : undefined,
        };
      });

      const nextPhase: GameRecord['phase'] =
        nextPending.length === 0
          ? {
              kind: 'aftermath',
              round,
              referee: 'running',
              crowd: 'running',
              ...(hasFailed ? { failedGenerals: nextFailed } : {}),
            }
          : {
              kind: 'generals',
              round,
              pending: nextPending,
              ...(hasFailed ? { failedGenerals: nextFailed } : {}),
            };

      return {
        ...state,
        rounds,
        phase: nextPhase,
        updatedAt: now,
      };
    }

    case 'GENERAL_FAILED': {
      if (state.phase.kind !== 'generals') return state;
      const { round, pending, failedGenerals } = state.phase;
      const nextPending = pending.filter((id) => id !== event.generalId);
      const nextFailed = {
        ...(failedGenerals ?? {}),
        [event.generalId]: event.code,
      };

      const rounds = upsertRound(state.rounds, round, (r) => ({
        ...r,
        failedGenerals: nextFailed,
      }));

      const targetRound = rounds.find((r) => r.n === round);
      const hasReplies = (targetRound?.generalMoves.length ?? 0) > 0;

      // A General that exhausts retries never blocks the round once pending is empty:
      // transition to aftermath so referee and crowd run on the replies that exist.
      const nextPhase: GameRecord['phase'] =
        nextPending.length === 0
          ? {
              kind: 'aftermath',
              round,
              referee: hasReplies ? 'running' : 'skipped',
              crowd: hasReplies ? 'running' : 'done',
              failedGenerals: nextFailed,
            }
          : {
              kind: 'generals',
              round,
              pending: nextPending,
              failedGenerals: nextFailed,
            };

      return {
        ...state,
        rounds,
        phase: nextPhase,
        updatedAt: now,
      };
    }

    case 'RETRY_GENERAL': {
      if (state.phase.kind !== 'generals' && state.phase.kind !== 'aftermath') {
        return state;
      }
      const { round, failedGenerals } = state.phase;
      const pending = state.phase.kind === 'generals' ? state.phase.pending : [];
      const nextFailed = { ...(failedGenerals ?? {}) };
      delete nextFailed[event.generalId];
      const nextPending = pending.includes(event.generalId)
        ? pending
        : [...pending, event.generalId];
      const hasFailed = Object.keys(nextFailed).length > 0;

      const rounds = upsertRound(state.rounds, round, (r) => ({
        ...r,
        failedGenerals: hasFailed ? nextFailed : undefined,
      }));

      return {
        ...state,
        rounds,
        phase: {
          kind: 'generals',
          round,
          pending: nextPending,
          ...(hasFailed ? { failedGenerals: nextFailed } : {}),
        },
        updatedAt: now,
      };
    }

    case 'CROWD_REACTED': {
      const targetRound =
        event.round ??
        (state.phase.kind === 'aftermath' ? state.phase.round : undefined);
      if (targetRound === undefined) return state;

      const newReactions = event.result.output.reactions.map((rx) => ({
        ...rx,
        source: event.result.source,
        latencyMs: event.result.latencyMs,
        model: event.result.model,
        fallback: event.result.fallback,
      }));

      const rounds = upsertRound(state.rounds, targetRound, (r) => {
        const existingIds = new Set(newReactions.map((nr) => nr.personaId));
        const kept = r.crowd.filter((c) => !existingIds.has(c.personaId));
        return {
          ...r,
          crowd: [...kept, ...newReactions],
        };
      });

      return {
        ...state,
        rounds,
        updatedAt: now,
      };
    }

    case 'CROWD_FINISHED': {
      if (state.phase.kind !== 'aftermath') return state;
      if (event.round !== undefined && state.phase.round !== event.round) {
        return state;
      }
      return {
        ...state,
        phase: {
          ...state.phase,
          crowd: 'done',
        },
        updatedAt: now,
      };
    }

    case 'REFEREE_RULED': {
      if (state.phase.kind !== 'aftermath') return state;
      const { round } = state.phase;
      const refereeRecord = {
        ...event.result.output,
        source: event.result.source,
        latencyMs: event.result.latencyMs,
        model: event.result.model,
        fallback: event.result.fallback,
      };

      const rounds = upsertRound(state.rounds, round, (r) => ({
        ...r,
        referee: refereeRecord,
      }));

      const existingSet = new Set(state.commitments.map((c) => c.toLowerCase()));
      const addedCommitments = event.result.output.commitments.filter(
        (c) => c.trim().length > 0 && !existingSet.has(c.trim().toLowerCase()),
      );

      return {
        ...state,
        rounds,
        commitments: [...state.commitments, ...addedCommitments],
        phase: {
          ...state.phase,
          referee: 'done',
        },
        updatedAt: now,
      };
    }

    case 'REFEREE_SKIPPED': {
      if (state.phase.kind !== 'aftermath') return state;
      return {
        ...state,
        phase: {
          ...state.phase,
          referee: 'skipped',
        },
        updatedAt: now,
      };
    }

    case 'NEXT': {
      if (state.phase.kind !== 'aftermath') return state;
      if (state.phase.referee === 'running') return state;

      const { round } = state.phase;
      if (round < state.totalRounds) {
        return {
          ...state,
          phase: { kind: 'user_turn', round: round + 1 },
          updatedAt: now,
        };
      }
      return {
        ...state,
        phase: { kind: 'reporting' },
        updatedAt: now,
      };
    }

    case 'REPORT_READY': {
      if (state.phase.kind !== 'reporting') return state;
      return {
        ...state,
        report: {
          ...event.result.output,
          source: event.result.source,
          latencyMs: event.result.latencyMs,
          model: event.result.model,
          fallback: event.result.fallback,
        },
        phase: { kind: 'done' },
        updatedAt: now,
      };
    }

    case 'FAILED': {
      if (!isAsyncPhase(state.phase)) return state;
      return {
        ...state,
        phase: {
          kind: 'failed',
          at: state.phase,
          code: event.code,
        },
        updatedAt: now,
      };
    }

    case 'RETRY': {
      if (state.phase.kind !== 'failed') return state;
      return {
        ...state,
        phase: state.phase.at,
        updatedAt: now,
      };
    }

    default:
      return state;
  }
}
