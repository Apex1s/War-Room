import {
  cleanPunctuation,
  computeGeneralScores,
  dispatchAndPersist,
  formatGeneralsStatus,
  rehydrate,
  resumePendingPhaseEffect,
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
import { HybridStats } from '../components/HybridStats';
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
  onOpenEgressInspector?: () => void;
}

export function WarRoomScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onBackToReview,
  onOpenReport,
  onOpenEgressInspector,
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
  const [moveText, setMoveText] = useState<string>('');

  const crowdAbortRef = useRef<AbortController | null>(null);
  const aftermathRunningRoundRef = useRef<number | null>(null);
  const resumeInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    setActiveViewRound(currentPhaseRound);
  }, [currentPhaseRound]);

  useEffect(() => {
    if (busy || resumeInFlightRef.current) return;
    const needsResume =
      game.phase.kind === 'sealing_move' ||
      (game.phase.kind === 'generals' && game.phase.pending.length > 0);
    if (!needsResume) return;

    resumeInFlightRef.current = true;
    setBusy(true);
    void resumePendingPhaseEffect(game, vaultRecord, {
      onStateChange: (nextGame, nextVault) => {
        onGameUpdated(nextGame, nextVault);
      },
    })
      .then((res) => {
        onGameUpdated(res.game, res.vaultRecord);
      })
      .finally(() => {
        resumeInFlightRef.current = false;
        setBusy(false);
      });
  }, [game, vaultRecord, busy, onGameUpdated]);

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
      setMoveText('');
      onGameUpdated(res.game, res.vaultRecord);
    } finally {
      setBusy(false);
    }
  };

  const handleRetryGeneral = async (generalId: string) => {
    if (
      busy ||
      (game.phase.kind !== 'generals' && game.phase.kind !== 'aftermath')
    ) {
      return;
    }
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

  const handleRetryFailedPhase = async () => {
    if (busy || game.phase.kind !== 'failed') return;
    setBusy(true);
    try {
      const restored = await dispatchAndPersist(
        game,
        vaultRecord,
        { type: 'RETRY' },
        { onStateChange: onGameUpdated },
      );
      onGameUpdated(restored, vaultRecord);
    } finally {
      setBusy(false);
    }
  };

  const handleNextRound = async () => {
    if (game.phase.kind !== 'aftermath' || game.phase.referee === 'running') {
      return;
    }

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
      setMoveText('');
      setActiveViewRound(nextRoundNum);
    }
  };

  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultRecord.map) : cleanPunctuation(text);

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
    <div className="flex flex-col gap-21" data-testid="screen-war-room">
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

      {/* Golden-ratio 61.8% / 38.2% split (docs/04-design-system.md §3) */}
      <div className="wr-split-golden">
        {/* Left Column (61.8%): Brief summary, MoveComposer / Aftermath bar, Round & 3 Generals */}
        <div className="flex flex-col gap-13 min-w-0">
          <div className={TOKENS.classes.card + ' grid grid-cols-1 md:grid-cols-2 gap-13'}>
            <div>
              <div className="terminal-label mb-5">
                OBJECTIVE ({showRehydrated ? 'LOCAL RE-HYDRATION' : 'ABSTRACTED'})
              </div>
              <div
                className="text-body text-text"
                data-testid="war-room-objective"
              >
                {formatText(game.objective)}
              </div>
            </div>
            <div>
              <div className="terminal-label mb-5">
                CONFIDENTIAL BRIEF ({showRehydrated ? 'LOCAL RE-HYDRATION' : 'ABSTRACTED'})
              </div>
              <div
                className="text-label text-muted whitespace-pre-wrap line-clamp-3"
                data-testid="war-room-brief"
              >
                {formatText(game.brief)}
              </div>
            </div>
          </div>

          {game.phase.kind === 'failed' && (
            <div
              className={TOKENS.classes.card + ' border-orange flex flex-wrap items-center justify-between gap-13'}
              data-testid="war-room-failed-banner"
            >
              <div className="flex flex-col gap-3">
                <span className="font-mono text-label uppercase tracking-[0.12em] text-orange">
                  INTERRUPTED OR FAILED ({game.phase.code})
                </span>
                <span className="text-body text-text">
                  The previous operation did not complete. Click Retry to resume from the last checkpoint.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleRetryFailedPhase()}
                disabled={busy}
                className={TOKENS.classes.btnPrimary}
                data-testid="btn-retry-failed-phase"
              >
                Retry
              </button>
            </div>
          )}

          {(game.phase.kind === 'user_turn' ||
            game.phase.kind === 'sealing_move' ||
            game.phase.kind === 'generals') && (
            <MoveComposer
              game={game}
              vaultRecord={vaultRecord}
              roundNumber={currentPhaseRound}
              moveText={moveText}
              placeholder={cleanPunctuation(template.openingMove)}
              onChangeMoveText={setMoveText}
              onSubmitMove={() => void handleSubmitMove()}
              onUndoMoveChip={(rNum, tok) => void handleUndoMoveChip(rNum, tok)}
              busy={busy}
            />
          )}

          {game.phase.kind === 'aftermath' && (
            <div
              className={TOKENS.classes.card + ' flex flex-wrap items-center justify-between gap-13'}
              data-testid="aftermath-advance-bar"
            >
              <div className="flex flex-col gap-5">
                <span className="terminal-label">
                  ROUND {game.phase.round} OF {game.totalRounds} AFTERMATH
                </span>
                <span className="font-mono text-label text-text">
                  {game.phase.referee === 'running'
                    ? 'Waiting for Referee verdict before advancing...'
                    : game.phase.crowd === 'running'
                      ? 'Referee done. Crowd is reacting in background; you can advance now.'
                      : 'Referee and Crowd complete.'}
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
                  ? `Next: round ${game.phase.round + 1}`
                  : 'Generate final verdict report'}
              </button>
            </div>
          )}

          {displayedRound && (
            <div
              className="flex flex-col gap-13"
              data-testid={`round-section-${displayedRound.n}`}
            >
              <div className={TOKENS.classes.card + ' flex flex-col gap-8'}>
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <div className="flex flex-wrap items-center gap-8">
                    <span className="terminal-label">
                      ROUND {displayedRound.n} OF {game.totalRounds}
                    </span>
                    <span className="font-mono text-label text-muted">·</span>
                    <span
                      className="font-mono text-label text-muted"
                      data-testid={`round-${displayedRound.n}-generals-status`}
                    >
                      {formatGeneralsStatus(
                        game.generals.length,
                        displayedRound.generalMoves.length,
                        Object.keys(
                          (game.phase.kind === 'generals' ||
                            game.phase.kind === 'aftermath') &&
                            game.phase.round === displayedRound.n
                            ? (game.phase.failedGenerals ??
                                displayedRound.failedGenerals ??
                                {})
                            : (displayedRound.failedGenerals ?? {}),
                        ).length,
                        game.phase.kind === 'generals' &&
                          game.phase.round === displayedRound.n
                          ? game.phase.pending.length
                          : 0,
                      )}
                    </span>
                  </div>

                  {(displayedRound.newEntries?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-8">
                      <span className="font-mono text-label text-mint uppercase">
                        {displayedRound.newEntries!.length} NEW MASKED IN MOVE:
                      </span>
                      {displayedRound.newEntries!.map((chip) => (
                        <span
                          key={chip.token}
                          className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label"
                        >
                          <span className="text-mint">{chip.token}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleUndoMoveChip(
                                displayedRound.n,
                                chip.token,
                              )
                            }
                            className="text-label text-text underline cursor-pointer"
                          >
                            Undo
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="text-body text-text"
                  data-testid={`round-${displayedRound.n}-user-move`}
                >
                  <span className="terminal-label mr-8">YOUR MOVE:</span>
                  <span>{formatText(displayedRound.userMove)}</span>
                </div>
              </div>

              {/* Three General cards */}
              <div className="flex flex-col gap-13">
                {game.generals.map((gen) => {
                  const reply = displayedRound.generalMoves.find(
                    (m) => m.generalId === gen.id,
                  );
                  const isPending =
                    game.phase.kind === 'generals' &&
                    game.phase.round === displayedRound.n &&
                    game.phase.pending.includes(gen.id);
                  const failedCode =
                    (game.phase.kind === 'generals' ||
                      game.phase.kind === 'aftermath') &&
                    game.phase.round === displayedRound.n
                      ? (game.phase.failedGenerals?.[gen.id] ??
                        displayedRound.failedGenerals?.[gen.id])
                      : displayedRound.failedGenerals?.[gen.id];
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
          )}
        </div>

        {/* Right Column (38.2%): Referee verdict, Crowd wall, Hybrid telemetry */}
        <div className="flex flex-col gap-13 min-w-0">
          {displayedRound && (
            <>
              <RefereePanel
                roundNumber={displayedRound.n}
                referee={displayedRound.referee}
                refereeStatus={
                  isAftermathForDisplayedRound &&
                  game.phase.kind === 'aftermath'
                    ? game.phase.referee
                    : displayedRound.referee
                      ? 'done'
                      : 'idle'
                }
                generals={game.generals}
                commitments={game.commitments}
                vaultMap={vaultRecord.map}
                showRehydrated={showRehydrated}
              />

              <CrowdWall
                roundNumber={displayedRound.n}
                allPersonas={game.crowd}
                reactions={displayedRound.crowd}
                crowdStatus={
                  isAftermathForDisplayedRound &&
                  game.phase.kind === 'aftermath'
                    ? game.phase.crowd
                    : 'done'
                }
                vaultMap={vaultRecord.map}
                showRehydrated={showRehydrated}
              />
            </>
          )}

          <HybridStats
            gameId={game.id}
            rawBriefChars={
              vaultRecord.rawObjective.length + vaultRecord.rawBrief.length
            }
            onOpenEgressInspector={onOpenEgressInspector}
          />
        </div>
      </div>
    </div>
  );
}
