import { setVaultEntries } from '../ai/egress-guard';
import { AiError, run, type AiErrorCode } from '../ai/router';
import { seal } from '../firewall/firewall';
import { applyMap } from '../firewall/placeholders';
import { gamesStore, settingsStore, vault } from '../storage/local-db';
import {
  buildCrowdInput,
  buildFinalReportInput,
  buildGeneralMoveInput,
  buildRefereeRoundInput,
} from './compact';
import { reduceGame } from './machine';
import type { GameEvent, GameRecord, VaultRecord } from './types';

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
 */
export async function retrySingleGeneralEffect(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  generalId: string,
  cb?: EngineCallbacks,
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  const game = await dispatchAndPersist(
    initialGame,
    vaultRecord,
    { type: 'RETRY_GENERAL', generalId },
    cb,
  );
  return runPendingGeneralsInParallel(game, vaultRecord, cb);
}

/**
 * Runs the round aftermath (`referee_round` and `crowd`).
 * If the referee fails twice, dispatches `REFEREE_SKIPPED` so a referee failure never ends a game.
 */
export async function runAftermathEffect(
  initialGame: GameRecord,
  vaultRecord: VaultRecord,
  cb?: EngineCallbacks & { crowdSignal?: AbortSignal },
): Promise<{ game: GameRecord; vaultRecord: VaultRecord }> {
  if (initialGame.phase.kind !== 'aftermath') {
    return { game: initialGame, vaultRecord };
  }

  const { round } = initialGame.phase;
  const roundRecord = initialGame.rounds.find((r) => r.n === round);
  if (!roundRecord) {
    return { game: initialGame, vaultRecord };
  }

  let game = initialGame;
  const applyEvent = async (event: GameEvent): Promise<void> => {
    game = reduceGame(game, event);
    await persistAndNotify(game, vaultRecord, cb);
  };

  const refereePromise = (async () => {
    const refInput = buildRefereeRoundInput(game, roundRecord, vaultRecord.map);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await run('referee_round', refInput, { gameId: game.id });
        await applyEvent({ type: 'REFEREE_RULED', result: res });
        return;
      } catch {
        if (attempt === 2) {
          await applyEvent({ type: 'REFEREE_SKIPPED' });
        }
      }
    }
  })();

  const crowdPromise = (async () => {
    const crowdInput = buildCrowdInput(
      game,
      roundRecord,
      game.crowd,
      vaultRecord.map,
    );
    try {
      const res = await run('crowd', crowdInput, {
        gameId: game.id,
        signal: cb?.crowdSignal,
      });
      await applyEvent({ type: 'CROWD_REACTED', result: res });
    } catch {
      // Crowd failure or abort does not block the round
    } finally {
      await applyEvent({ type: 'CROWD_FINISHED' });
    }
  })();

  await Promise.all([refereePromise, crowdPromise]);
  return { game, vaultRecord };
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
      { type: 'FAILED', code: toAiErrorCode(err) },
      cb,
    );
  }

  return { game, vaultRecord };
}
