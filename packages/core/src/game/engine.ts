import { isDeviceReadyForOnlyOnDevice } from '../ai/device';
import { setVaultEntries } from '../ai/egress-guard';
import {
  AiError,
  extractErrorDetail,
  run,
  type AiErrorCode,
  type AiErrorDetail,
  type AiResult,
} from '../ai/router';
import { parseUrlOverrides } from '../ai/routing-table';
import type { RefereeLiveOutput } from '../ai/schemas';
import { seal } from '../firewall/firewall';
import { applyMap } from '../firewall/placeholders';
import { gamesStore, settingsStore, vault } from '../storage/local-db';
import {
  buildCrowdInput,
  buildFinalReportInput,
  buildGeneralMoveInput,
  buildRefereeLiveInput,
  buildRefereeRoundInput,
  selectRoundPersonas,
} from './compact';
import { reduceGame } from './machine';
import type {
  GameEvent,
  GameRecord,
  RoundRecord,
  VaultRecord,
  WhatIfRecord,
} from './types';

export interface EngineCallbacks {
  onStateChange?: (game: GameRecord, vaultRecord: VaultRecord) => void;
  legend?: string[];
  skipAftermath?: boolean;
}

async function persistAndNotify(
  game: GameRecord,
  vaultRecord: VaultRecord,
  cb?: EngineCallbacks,
): Promise<void> {
  await Promise.all([gamesStore.put(game), vault.put(vaultRecord)]);
  cb?.onStateChange?.(game, vaultRecord);
}

function toAiErrorCode(err: unknown): AiErrorCode {
  if (err instanceof AiError) return err.code;
  return 'cloud_unavailable';
}

function toAiErrorDetail(err: unknown): AiErrorDetail {
  return extractErrorDetail(err);
}

export async function dispatchAndPersist(
  game: GameRecord,
  vaultRecord: VaultRecord,
  event: GameEvent,
  cb?: EngineCallbacks,
): Promise<GameRecord> {
  const next = reduceGame(game, event);
  await persistAndNotify(next, vaultRecord, cb);
  return next;
}

/**
 * Seals the user's raw objective + brief in a single `seal()` call, computes
 * `applyMap(rawObjective, map)` and `applyMap(rawBrief, map)`, and transitions to `review`.
 */
export async function runSealBriefEffect(
  initialGame: GameRecord,
  initialVault: VaultRecord,
  rawObjective: string,
  rawBrief: string,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  let game = await dispatchAndPersist(
    initialGame,
    initialVault,
    {
      type: 'BRIEF_SUBMITTED',
      objective: rawObjective,
      brief: rawBrief,
      templateId: initialGame.templateId,
    },
    cb,
  );

  try {
    const alwaysRedact = await settingsStore.getAlwaysRedactList();
    const combined = `${rawObjective}\n\n${rawBrief}`;
    const result = await seal(combined, initialVault.map, {
      customAlwaysRedact: alwaysRedact,
      gameId: game.id,
      onProgress: (progress) => {
        game = reduceGame(game, { type: 'SEAL_PROGRESS', progress });
        cb?.onStateChange?.(game, initialVault);
      },
    });

    const abstractedObjective = applyMap(rawObjective, result.map);
    const abstractedBrief = applyMap(rawBrief, result.map);

    const nextVault: VaultRecord = {
      ...initialVault,
      rawObjective,
      rawBrief,
      map: result.map,
    };

    setVaultEntries(result.map, game.id);

    game = await dispatchAndPersist(
      game,
      nextVault,
      {
        type: 'BRIEF_SEALED',
        result,
        abstractedObjective,
        abstractedBrief,
      },
      cb,
    );

    return { game, vaultRecord: nextVault };
  } catch (err) {
    game = await dispatchAndPersist(
      game,
      initialVault,
      { type: 'FAILED', code: toAiErrorCode(err) },
      cb,
    );
    return { game, vaultRecord: initialVault };
  }
}

/**
 * Seals a player's round move, then runs all Generals in parallel via `run('general_move')`.
 * One General failing does NOT fail the round: it dispatches `GENERAL_FAILED` for that
 * General so its card shows a retry button while the other Generals' replies remain intact.
 */
export async function runPlayerMoveAndGeneralsEffect(
  initialGame: GameRecord,
  initialVault: VaultRecord,
  rawMoveText: string,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  if (initialGame.phase.kind !== 'user_turn') {
    return { game: initialGame, vaultRecord: initialVault };
  }

  const roundNumber = initialGame.phase.round;
  let game = await dispatchAndPersist(
    initialGame,
    initialVault,
    { type: 'MOVE_SUBMITTED', text: rawMoveText },
    cb,
  );

  let vaultRecord = initialVault;
  try {
    const existingTokens = new Set(initialVault.map.map((e) => e.token));
    const sealedMove = await seal(rawMoveText, initialVault.map, {
      gameId: game.id,
    });
    const newEntries = sealedMove.map.filter((e) => !existingTokens.has(e.token));

    vaultRecord = {
      ...initialVault,
      rawMoves: {
        ...initialVault.rawMoves,
        [roundNumber]: rawMoveText,
      },
      map: sealedMove.map,
    };

    setVaultEntries(sealedMove.map, game.id);

    game = await dispatchAndPersist(
      game,
      vaultRecord,
      {
        type: 'MOVE_SEALED',
        abstracted: sealedMove.abstracted,
        newEntries,
      },
      cb,
    );
  } catch (err) {
    game = await dispatchAndPersist(
      game,
      vaultRecord,
      { type: 'FAILED', code: toAiErrorCode(err) },
      cb,
    );
    return { game, vaultRecord };
  }

  return runPendingGeneralsInParallel(game, vaultRecord, cb);
}

/**
 * Runs all currently pending Generals for the active round in parallel.
 */
export async function runPendingGeneralsInParallel(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  if (initialGame.phase.kind !== 'generals') {
    return { game: initialGame, vaultRecord };
  }

  const { round, pending } = initialGame.phase;
  const roundRecord = initialGame.rounds.find((r) => r.n === round);
  const currentMove = roundRecord?.userMove ?? '';
  let game = initialGame;

  const targetGenerals = game.generals.filter((g) => pending.includes(g.id));

  const applyEvent = async (event: GameEvent): Promise<void> => {
    game = reduceGame(game, event);
    await persistAndNotify(game, vaultRecord, cb);
  };

  await Promise.allSettled(
    targetGenerals.map(async (general) => {
      const promptInput = buildGeneralMoveInput(
        game,
        general,
        round,
        currentMove,
        vaultRecord.map,
        cb?.legend,
      );
      try {
        const result = await run('general_move', promptInput, { gameId: game.id });
        await applyEvent({ type: 'GENERAL_MOVED', generalId: general.id, result });
      } catch (err) {
        await applyEvent({
          type: 'GENERAL_FAILED',
          generalId: general.id,
          code: toAiErrorCode(err),
          detail: toAiErrorDetail(err),
        });
      }
    }),
  );

  // If all Generals succeeded and we transitioned to aftermath:
  if (game.phase.kind === 'aftermath' && cb?.skipAftermath) {
    await applyEvent({ type: 'REFEREE_SKIPPED' });
    await applyEvent({ type: 'CROWD_FINISHED' });
  }

  return { game, vaultRecord };
}

/**
 * Retries a single failed General in place without re-running the other Generals.
 * If the retried General succeeds and all Generals are now resolved, re-runs `referee_round`
 * for that round and replaces its verdict.
 */
export async function retrySingleGeneralEffect(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  generalId: string,
  cb?: EngineCallbacks & { signal?: AbortSignal; crowdSignal?: AbortSignal },
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  const game = await dispatchAndPersist(
    initialGame,
    vaultRecord,
    { type: 'RETRY_GENERAL', generalId },
    cb,
  );
  const afterRetry = await runPendingGeneralsInParallel(game, vaultRecord, cb);
  const afterPhase = afterRetry.game.phase;
  if (afterPhase.kind === 'aftermath' && !cb?.skipAftermath) {
    const roundRec = afterRetry.game.rounds.find((r) => r.n === afterPhase.round);
    const retriedReplied =
      roundRec?.generalMoves.some((m) => m.generalId === generalId) ?? false;
    if (retriedReplied && afterPhase.referee === 'running') {
      return runAftermathEffect(afterRetry.game, afterRetry.vaultRecord, cb);
    }
  }
  return afterRetry;
}

/**
 * Runs the round aftermath (`referee_round` and `crowd`).
 * Only starts once every General has replied or exhausted retries.
 * If the referee fails twice, dispatches `REFEREE_SKIPPED` so a referee failure never ends a game.
 */
export async function runAftermathEffect(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  cb?: EngineCallbacks & { signal?: AbortSignal; crowdSignal?: AbortSignal },
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  if (initialGame.phase.kind !== 'aftermath') {
    return { game: initialGame, vaultRecord };
  }

  const { round } = initialGame.phase;
  const roundRecord = initialGame.rounds.find((r) => r.n === round);
  if (!roundRecord) {
    return { game: initialGame, vaultRecord };
  }

  const repliedIds = new Set(roundRecord.generalMoves.map((m) => m.generalId));
  const failedMap = {
    ...(roundRecord.failedGenerals ?? {}),
    ...(initialGame.phase.failedGenerals ?? {}),
  };
  const allGeneralsResolved = initialGame.generals.every(
    (g) => repliedIds.has(g.id) || g.id in failedMap,
  );
  if (!allGeneralsResolved) {
    return { game: initialGame, vaultRecord };
  }

  let game = initialGame;
  const applyEvent = async (event: GameEvent): Promise<void> => {
    if (cb?.signal?.aborted) return;
    game = reduceGame(game, event);
    await persistAndNotify(game, vaultRecord, cb);
  };

  if (roundRecord.generalMoves.length === 0) {
    if (initialGame.phase.referee === 'running') {
      await applyEvent({ type: 'REFEREE_SKIPPED' });
    }
    if (initialGame.phase.crowd === 'running') {
      await applyEvent({ type: 'CROWD_FINISHED', round });
    }
    return { game, vaultRecord };
  }

  const shouldRunReferee = initialGame.phase.referee === 'running';
  const shouldRunCrowd = initialGame.phase.crowd === 'running';

  const refereePromise = shouldRunReferee
    ? (async () => {
        const refInput = buildRefereeRoundInput(game, roundRecord, vaultRecord.map);
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (cb?.signal?.aborted) return;
          try {
            const res = await run('referee_round', refInput, {
              gameId: game.id,
              signal: cb?.signal,
            });
            await applyEvent({ type: 'REFEREE_RULED', result: res, round });
            return;
          } catch {
            if (cb?.signal?.aborted) return;
            if (attempt === 2) {
              await applyEvent({ type: 'REFEREE_SKIPPED' });
            }
          }
        }
      })()
    : Promise.resolve();

  const crowdPromise = shouldRunCrowd
    ? (async () => {
        const roundPersonas = selectRoundPersonas(game.crowd, roundRecord.n);
        const crowdInput = buildCrowdInput(
          game,
          roundRecord,
          roundPersonas,
          vaultRecord.map,
        );
        try {
          const res = await run('crowd', crowdInput, {
            gameId: game.id,
            signal: cb?.crowdSignal ?? cb?.signal,
          });
          await applyEvent({ type: 'CROWD_REACTED', result: res, round });
        } catch {
          // Crowd failure or abort does not block the round
        } finally {
          await applyEvent({ type: 'CROWD_FINISHED', round });
        }
      })()
    : Promise.resolve();

  await Promise.all([refereePromise, crowdPromise]);
  return { game, vaultRecord };
}

const refereeLiveCache = new Map<string, AiResult<RefereeLiveOutput>>();

export function clearRefereeLiveCache(): void {
  refereeLiveCache.clear();
}

/**
 * Live on-device coaching (`referee_live`, ONLY_ON_DEVICE) while the player types a move.
 * - Requires at least 40 characters (design doc §6).
 * - Hidden / returns null when on-device AI is unavailable.
 * - Caches results by `(gameId, commitments, trimmedDraft)` so repeated checks on the same draft cost zero calls.
 */
export async function runRefereeLiveEffect(
  game: GameRecord,
  rawDraft: string,
  opts?: { signal?: AbortSignal },
): Promise<AiResult<RefereeLiveOutput> | null> {
  const trimmed = rawDraft.trim();
  if (trimmed.length < 40) return null;
  if (!isDeviceReadyForOnlyOnDevice() || parseUrlOverrides().forceCloud) {
    return null;
  }

  const cacheKey = `${game.id}|${game.commitments.join(';')}|${trimmed}`;
  const cached = refereeLiveCache.get(cacheKey);
  if (cached) return cached;

  const input = buildRefereeLiveInput(game, trimmed);
  const result = await run('referee_live', input, {
    gameId: game.id,
    signal: opts?.signal,
  });
  refereeLiveCache.set(cacheKey, result);
  return result;
}

/**
 * Undoes a newly masked entity chip from a player's round move:
 * disables the placeholder entry in `vaultRecord.map`, updates `roundRecord.userMove`
 * from `vaultRecord.rawMoves[roundNumber]`, and removes the chip from `roundRecord.newEntries`.
 */
export async function undoMoveMaskedEntryEffect(
  initialGame: GameRecord,
  initialVault: VaultRecord,
  roundNumber: number,
  token: string,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  const nextMap = initialVault.map.map((entry) =>
    entry.token === token ? { ...entry, enabled: false } : entry,
  );
  const rawMove = initialVault.rawMoves[roundNumber];
  const nextVault: VaultRecord = {
    ...initialVault,
    map: nextMap,
  };

  setVaultEntries(nextMap, initialGame.id);

  const nextRounds = initialGame.rounds.map((r) => {
    if (r.n !== roundNumber) return r;
    return {
      ...r,
      userMove: rawMove !== undefined ? applyMap(rawMove, nextMap) : r.userMove,
      newEntries: (r.newEntries ?? []).filter((e) => e.token !== token),
    };
  });

  const nextGame: GameRecord = {
    ...initialGame,
    rounds: nextRounds,
    updatedAt: Date.now(),
  };

  await persistAndNotify(nextGame, nextVault, cb);
  return { game: nextGame, vaultRecord: nextVault };
}

/**
 * Resumes interrupted work after a page reload so no card is left spinning with nothing in flight:
 * - `sealing_move`: if `vaultRecord.rawMoves[round]` exists, finishes sealing and runs Generals;
 *   otherwise transitions to `failed` (targeting `user_turn(round)`) with a Retry button.
 * - `generals`: if `pending.length > 0`, runs all still-pending Generals in parallel.
 * - `aftermath`: if `referee === 'running'` or `crowd === 'running'`, runs the pending aftermath tasks.
 * - `reporting`: runs `runFinalReportEffect`.
 */
export async function resumePendingPhaseEffect(
  initialGame: GameRecord,
  initialVault: VaultRecord,
  cb?: EngineCallbacks & { crowdSignal?: AbortSignal },
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  const phase = initialGame.phase;

  if (phase.kind === 'sealing_move') {
    const roundNumber = phase.round;
    const savedRawMove = initialVault.rawMoves[roundNumber];
    if (!savedRawMove) {
      const failedGame: GameRecord = {
        ...initialGame,
        phase: {
          kind: 'failed',
          at: { kind: 'user_turn', round: roundNumber },
          code: 'aborted',
        },
        updatedAt: Date.now(),
      };
      await persistAndNotify(failedGame, initialVault, cb);
      return { game: failedGame, vaultRecord: initialVault };
    }

    try {
      const existingTokens = new Set(initialVault.map.map((e) => e.token));
      const sealedMove = await seal(savedRawMove, initialVault.map, {
        gameId: initialGame.id,
      });
      const newEntries = sealedMove.map.filter((e) => !existingTokens.has(e.token));
      const nextVault: VaultRecord = {
        ...initialVault,
        map: sealedMove.map,
      };
      setVaultEntries(sealedMove.map, initialGame.id);

      const gameAfterSeal = await dispatchAndPersist(
        initialGame,
        nextVault,
        {
          type: 'MOVE_SEALED',
          abstracted: sealedMove.abstracted,
          newEntries,
        },
        cb,
      );
      return runPendingGeneralsInParallel(gameAfterSeal, nextVault, cb);
    } catch (err) {
      const failedGame = await dispatchAndPersist(
        initialGame,
        initialVault,
        { type: 'FAILED', code: toAiErrorCode(err) },
        cb,
      );
      return { game: failedGame, vaultRecord: initialVault };
    }
  }

  if (phase.kind === 'generals') {
    if (phase.pending.length > 0) {
      return runPendingGeneralsInParallel(initialGame, initialVault, cb);
    }
    return { game: initialGame, vaultRecord: initialVault };
  }

  if (phase.kind === 'aftermath') {
    if (phase.referee === 'running' || phase.crowd === 'running') {
      return runAftermathEffect(initialGame, initialVault, cb);
    }
    return { game: initialGame, vaultRecord: initialVault };
  }

  if (phase.kind === 'reporting') {
    return runFinalReportEffect(initialGame, initialVault, cb);
  }

  return { game: initialGame, vaultRecord: initialVault };
}

/**
 * Offline What-If simulation (design doc §6):
 * In replay, edits a past round's move, seals it locally, and re-runs `crowd` (5 rotating personas)
 * and `referee_round` with `only_on_device` against the recorded General replies of that round.
 * Stores the result in `game.whatIfs`. Works with the network off.
 */
export async function runWhatIfEffect(
  initialGame: GameRecord,
  initialVault: VaultRecord,
  roundNumber: number,
  rawWhatIfMove: string,
  cb?: EngineCallbacks & { crowdSignal?: AbortSignal },
): Promise<{
  game: GameRecord;
  vaultRecord: VaultRecord;
  whatIf: WhatIfRecord;
}> {
  const originalRound = initialGame.rounds.find((r) => r.n === roundNumber);
  if (!originalRound) {
    throw new RangeError(`Round ${roundNumber} not found in game ${initialGame.id}`);
  }

  const sealedMove = await seal(rawWhatIfMove, initialVault.map, {
    gameId: initialGame.id,
  });

  const nextVault: VaultRecord = {
    ...initialVault,
    map: sealedMove.map,
  };
  setVaultEntries(sealedMove.map, initialGame.id);

  const syntheticRound: RoundRecord = {
    ...originalRound,
    userMove: sealedMove.abstracted,
  };

  const refInput = buildRefereeRoundInput(
    initialGame,
    syntheticRound,
    nextVault.map,
  );
  const roundPersonas = selectRoundPersonas(initialGame.crowd, roundNumber);
  const crowdInput = buildCrowdInput(
    initialGame,
    syntheticRound,
    roundPersonas,
    nextVault.map,
  );

  const [refRes, crowdRes] = await Promise.all([
    run('referee_round', refInput, {
      gameId: initialGame.id,
      modeOverride: 'only_on_device',
    }),
    run('crowd', crowdInput, {
      gameId: initialGame.id,
      modeOverride: 'only_on_device',
      signal: cb?.crowdSignal,
    }),
  ]);

  const whatIf: WhatIfRecord = {
    round: roundNumber,
    userMove: sealedMove.abstracted,
    crowd: crowdRes.output.reactions.map((rx) => ({
      ...rx,
      source: crowdRes.source,
      latencyMs: crowdRes.latencyMs,
      model: crowdRes.model,
      fallback: crowdRes.fallback,
    })),
    referee: {
      ...refRes.output,
      source: refRes.source,
      latencyMs: refRes.latencyMs,
      model: refRes.model,
      fallback: refRes.fallback,
    },
    createdAt: Date.now(),
  };

  const nextGame: GameRecord = {
    ...initialGame,
    whatIfs: [...initialGame.whatIfs, whatIf],
    updatedAt: whatIf.createdAt,
  };

  await persistAndNotify(nextGame, nextVault, cb);
  return {
    game: nextGame,
    vaultRecord: nextVault,
    whatIf,
  };
}

export async function runFinalReportEffect(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  if (initialGame.phase.kind !== 'reporting') {
    return { game: initialGame, vaultRecord };
  }

  let game = initialGame;
  try {
    const input = buildFinalReportInput(game, vaultRecord.map, cb?.legend);
    const res = await run('final_report', input, { gameId: game.id });
    game = await dispatchAndPersist(
      game,
      vaultRecord,
      { type: 'REPORT_READY', result: res },
      cb,
    );
  } catch (err) {
    game = await dispatchAndPersist(
      game,
      vaultRecord,
      { type: 'FAILED', code: toAiErrorCode(err), detail: toAiErrorDetail(err) },
      cb,
    );
  }

  return { game, vaultRecord };
}
