import {
  computeGeneralScores,
  dispatchAndPersist,
  rehydrate,
  retrySingleGeneralEffect,
  runAftermathEffect,
  runPlayerMoveAndGeneralsEffect,
  TEMPLATES,
  undoMoveMaskedEntryEffect,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { useEffect, useRef, useState } from 'react';
import { AgentCard } from '../components/AgentCard';
import { CrowdWall } from '../components/CrowdWall';
import { MoveComposer } from '../components/MoveComposer';
import { RefereePanel } from '../components/RefereePanel';
import { RoundTimeline } from '../components/RoundTimeline';
import { TOKENS } from '../tokens';

export interface WarRoomScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onBackToReview: () => void;
  onOpenReport?: () => void;
}

export function WarRoomScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onBackToReview,
  onOpenReport,
}: WarRoomScreenProps) {
  const template = TEMPLATES[game.templateId];

  const currentPhaseRound =
    game.phase.kind === 'user_turn' ||
    game.phase.kind === 'sealing_move' ||
    game.phase.kind === 'generals' ||
    game.phase.kind === 'aftermath'
      ? game.phase.round
      : game.rounds.length || 1;

  const [activeViewRound, setActiveViewRound] = useState<number>(currentPhaseRound);
  const [showRehydrated, setShowRehydrated] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);

  const defaultMoveForRound = (rNum: number): string => {
    if (rNum === 1) return template.openingMove;
    if (rNum === 2) {
      return 'Lock in annual pre-paid contracts with existing design partners and ship cross-vendor integrations incumbents cannot bundle.';
    }
    return 'Shift acquisition to partner-led compliance templates and cap customer payback at 45 days.';
  };

  const [moveText, setMoveText] = useState<string>(() =>
    defaultMoveForRound(currentPhaseRound),
  );

  const crowdAbortRef = useRef<AbortController | null>(null);
  const aftermathRunningRoundRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveViewRound(currentPhaseRound);
  }, [currentPhaseRound]);

  // If the page reloads while already in aftermath with referee/crowd still marked 'running',
  // kick off runAftermathEffect once for that round.
  useEffect(() => {
    if (
      game.phase.kind === 'aftermath' &&
      (game.phase.referee === 'running' || game.phase.crowd === 'running') &&
      aftermathRunningRoundRef.current !== game.phase.round
    ) {
      const roundNum = game.phase.round;
      aftermathRunningRoundRef.current = roundNum;
      const controller = new AbortController();
      crowdAbortRef.current = controller;

      void runAftermathEffect(game, vaultRecord, {
        crowdSignal: controller.signal,
        onStateChange: (nextGame, nextVault) => {
          onGameUpdated(nextGame, nextVault);
        },
      }).finally(() => {
        if (aftermathRunningRoundRef.current === roundNum) {
          aftermathRunningRoundRef.current = null;
        }
      });
    }
  }, [game, vaultRecord, onGameUpdated]);

  const handleSubmitMove = async () => {
    if (!moveText.trim() || busy || game.phase.kind !== 'user_turn') return;
    setBusy(true);
    try {
      const res = await runPlayerMoveAndGeneralsEffect(
        game,
        vaultRecord,
        moveText.trim(),
        {
          onStateChange: (nextGame, nextVault) => {
            onGameUpdated(nextGame, nextVault);
          },
        },
      );
      onGameUpdated(res.game, res.vaultRecord);
    } finally {
      setBusy(false);
    }
  };

  const handleRetryGeneral = async (generalId: string) => {
    if (busy || game.phase.kind !== 'generals') return;
    setBusy(true);
    try {
      const res = await retrySingleGeneralEffect(
        game,
        vaultRecord,
        generalId,
        {
          onStateChange: onGameUpdated,
        },
      );
      onGameUpdated(res.game, res.vaultRecord);
    } finally {
      setBusy(false);
    }
  };

  const handleUndoMoveChip = async (roundNumber: number, token: string) => {
    const res = await undoMoveMaskedEntryEffect(
      game,
      vaultRecord,
      roundNumber,
      token,
      {
        onStateChange: onGameUpdated,
      },
    );
    onGameUpdated(res.game, res.vaultRecord);
  };

  const handleNextRound = async () => {
    if (game.phase.kind !== 'aftermath' || game.phase.referee === 'running') {
      return;
    }

    // Pressing NEXT aborts any still-running background crowd call so it never blocks
    if (game.phase.crowd === 'running' && crowdAbortRef.current) {
      crowdAbortRef.current.abort();
      crowdAbortRef.current = null;
    }

    const nextRoundNum = game.phase.round + 1;
    const nextGame = await dispatchAndPersist(
      game,
      vaultRecord,
      { type: 'NEXT' },
      { onStateChange: onGameUpdated },
    );
    onGameUpdated(nextGame, vaultRecord);

    if (nextRoundNum <= game.totalRounds) {
      setMoveText(defaultMoveForRound(nextRoundNum));
      setActiveViewRound(nextRoundNum);
    }
  };

  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultRecord.map) : text;

  const scores = computeGeneralScores(game.generals, game.rounds);
  const scoreMap = new Map(scores.map((s) => [s.generalId, s.score]));

  const displayedRound =
    game.rounds.find((r) => r.n === activeViewRound) ??
    game.rounds[game.rounds.length - 1];

  const isAftermathForDisplayedRound =
    game.phase.kind === 'aftermath' &&
    displayedRound !== undefined &&
    game.phase.round === displayedRound.n;

  const canAdvanceAftermath =
    game.phase.kind === 'aftermath' && game.phase.referee !== 'running';

  return (
    <div className="flex flex-col gap-5" data-testid="screen-war-room">
      <RoundTimeline
        game={game}
        vaultRecord={vaultRecord}
        activeViewRound={activeViewRound}
        onSelectViewRound={setActiveViewRound}
        showRehydrated={showRehydrated}
        onToggleRehydrated={() => setShowRehydrated((prev) => !prev)}
        onBackToReview={onBackToReview}
        onViewReport={onOpenReport}
      />

      {/* Brief Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#111826] border border-[#223049]">
        <div>
          <div className="text-xs font-mono text-[#8B9BB4] mb-1">
            Objective ({showRehydrated ? 'Re-hydrated locally' : 'Abstracted'})
          </div>
          <div
            className="text-xs font-mono text-emerald-300"
            data-testid="war-room-objective"
          >
            {formatText(game.objective)}
          </div>
        </div>
        <div>
          <div className="text-xs font-mono text-[#8B9BB4] mb-1">
            Confidential Brief ({showRehydrated ? 'Re-hydrated locally' : 'Abstracted'})
          </div>
          <div
            className="text-xs font-mono text-[#E6EDF3] whitespace-pre-wrap line-clamp-3"
            data-testid="war-room-brief"
          >
            {formatText(game.brief)}
          </div>
        </div>
      </div>

      {/* Move Composer (shown when in user_turn, sealing_move, or generals for current round) */}
      {(game.phase.kind === 'user_turn' ||
        game.phase.kind === 'sealing_move' ||
        game.phase.kind === 'generals') && (
        <MoveComposer
          game={game}
          vaultRecord={vaultRecord}
          roundNumber={currentPhaseRound}
          moveText={moveText}
          onChangeMoveText={setMoveText}
          onSubmitMove={() => void handleSubmitMove()}
          onUndoMoveChip={(rNum, tok) => void handleUndoMoveChip(rNum, tok)}
          busy={busy}
        />
      )}

      {/* Aftermath Control Bar (NEXT works as soon as Referee completes, even while Crowd is still running) */}
      {game.phase.kind === 'aftermath' && (
        <div
          className="p-4 rounded-lg border border-[#E0A84B]/60 bg-[#162032] flex flex-wrap items-center justify-between gap-3"
          data-testid="aftermath-advance-bar"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
              Round {game.phase.round} Aftermath
            </span>
            <span className="text-xs font-mono text-[#E6EDF3]">
              {game.phase.referee === 'running'
                ? '🔒 Waiting for Referee verdict before advancing…'
                : game.phase.crowd === 'running'
                  ? '✓ Referee done. Crowd is still reacting in background — you can advance now.'
                  : '✓ Referee and Crowd complete.'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleNextRound()}
            disabled={!canAdvanceAftermath}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-next-round"
          >
            {game.phase.round < game.totalRounds
              ? `Next: Round ${game.phase.round + 1} →`
              : 'Generate Final Verdict Report →'}
          </button>
        </div>
      )}

      {/* Displayed Round Details: Player Move + 3 Generals + Referee Panel + Crowd Wall */}
      {displayedRound && (
        <div
          className="flex flex-col gap-4"
          data-testid={`round-section-${displayedRound.n}`}
        >
          <div className={TOKENS.classes.card + ' flex flex-col gap-4'}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#223049] pb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
                  Round {displayedRound.n} of {game.totalRounds}
                </span>
                <div
                  className="text-sm font-mono text-[#E6EDF3] mt-1"
                  data-testid={`round-${displayedRound.n}-user-move`}
                >
                  <span className="text-[#8B9BB4]">Your Move:</span>{' '}
                  {formatText(displayedRound.userMove)}
                </div>
              </div>

              {(displayedRound.newEntries?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-mono text-emerald-400">
                    {displayedRound.newEntries!.length} new masked in move:
                  </span>
                  {displayedRound.newEntries!.map((chip) => (
                    <span
                      key={chip.token}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono"
                    >
                      <span className="text-emerald-300">{chip.token}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleUndoMoveChip(displayedRound.n, chip.token)
                        }
                        className="ml-1 text-[11px] text-[#E0A84B] hover:underline cursor-pointer"
                      >
                        Undo
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 3 Generals Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {game.generals.map((gen) => {
                const reply = displayedRound.generalMoves.find(
                  (m) => m.generalId === gen.id,
                );
                const isPending =
                  game.phase.kind === 'generals' &&
                  game.phase.round === displayedRound.n &&
                  game.phase.pending.includes(gen.id);
                const failedCode =
                  game.phase.kind === 'generals' &&
                  game.phase.round === displayedRound.n
                    ? game.phase.failedGenerals?.[gen.id]
                    : undefined;
                const scoreDelta = displayedRound.referee?.scores.find(
                  (s) => s.generalId === gen.id,
                )?.delta;

                return (
                  <AgentCard
                    key={gen.id}
                    general={gen}
                    roundNumber={displayedRound.n}
                    reply={reply}
                    scoreDelta={scoreDelta}
                    cumulativeScore={scoreMap.get(gen.id) ?? 0}
                    isPending={isPending}
                    failedCode={failedCode}
                    vaultMap={vaultRecord.map}
                    showRehydrated={showRehydrated}
                    busy={busy}
                    onRetryGeneral={(gid) => void handleRetryGeneral(gid)}
                  />
                );
              })}
            </div>
          </div>

          {/* Referee Verdict Panel */}
          {(displayedRound.referee !== null || isAftermathForDisplayedRound) && (
            <RefereePanel
              roundNumber={displayedRound.n}
              referee={displayedRound.referee}
              refereeStatus={
                isAftermathForDisplayedRound && game.phase.kind === 'aftermath'
                  ? game.phase.referee
                  : displayedRound.referee
                    ? 'done'
                    : 'skipped'
              }
              generals={game.generals}
              commitments={game.commitments}
              vaultMap={vaultRecord.map}
              showRehydrated={showRehydrated}
            />
          )}

          {/* Crowd Wall (5 Rotating Personas) */}
          {(displayedRound.crowd.length > 0 || isAftermathForDisplayedRound) && (
            <CrowdWall
              roundNumber={displayedRound.n}
              allPersonas={game.crowd}
              reactions={displayedRound.crowd}
              crowdStatus={
                isAftermathForDisplayedRound && game.phase.kind === 'aftermath'
                  ? game.phase.crowd
                  : 'done'
              }
              vaultMap={vaultRecord.map}
              showRehydrated={showRehydrated}
            />
          )}
        </div>
      )}
    </div>
  );
}
