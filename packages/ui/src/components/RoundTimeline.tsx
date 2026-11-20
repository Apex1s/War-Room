import {
  computeGeneralScores,
  formatPhaseStatus,
  formatPlayerVsGeneralScore,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { TOKENS } from '../tokens';

export interface RoundTimelineProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  activeViewRound: number;
  onSelectViewRound: (round: number) => void;
  showRehydrated: boolean;
  onToggleRehydrated: () => void;
  onBackToReview: () => void;
  onViewReport?: () => void;
}

export function RoundTimeline({
  game,
  vaultRecord,
  activeViewRound,
  onSelectViewRound,
  showRehydrated,
  onToggleRehydrated,
  onBackToReview,
  onViewReport,
}: RoundTimelineProps) {
  const scores = computeGeneralScores(game.generals, game.rounds);
  const maskedCount = vaultRecord.map.filter((e) => e.enabled).length;

  const currentPhaseRound =
    game.phase.kind === 'user_turn' ||
    game.phase.kind === 'sealing_move' ||
    game.phase.kind === 'generals' ||
    game.phase.kind === 'aftermath'
      ? game.phase.round
      : game.totalRounds;

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-13'}
      data-testid="round-timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-13">
        <div>
          <div className="flex flex-wrap items-center gap-8">
            <span className="px-8 py-3 rounded-[3px] border border-mint bg-bg font-mono text-label uppercase tracking-[0.12em] text-mint">
              <span className="whitespace-nowrap">VAULT SEALED</span>{' '}
              <span className="whitespace-nowrap">
                ({maskedCount} SECRETS{' '}
                <span className="whitespace-nowrap">ON-DEVICE)</span>
              </span>
            </span>
            <span
              className="px-8 py-3 rounded-[3px] border border-line bg-bg terminal-label whitespace-nowrap"
              data-testid="game-phase-badge"
            >
              {formatPhaseStatus(game.phase, game.totalRounds)}
            </span>
          </div>
          <h2 className="text-title font-semibold text-text mt-5 mb-0">
            Situation room: multi-agent stress test
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-8">
          <button
            type="button"
            onClick={onToggleRehydrated}
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-toggle-rehydration"
          >
            {showRehydrated
              ? 'Real names (local re-hydration)'
              : 'Abstracted tokens (cloud view)'}
          </button>

          <button
            type="button"
            onClick={onBackToReview}
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-return-review"
          >
            Firewall map
          </button>
        </div>
      </div>

      {/* Round pills + Final Report pill */}
      <div className="flex flex-wrap items-center justify-between gap-13 pt-13 border-t border-line">
        <div className="flex flex-wrap items-center gap-8">
          {Array.from({ length: game.totalRounds }, (_, i) => i + 1).map(
            (rNum) => {
              const roundRec = game.rounds.find((r) => r.n === rNum);
              const settledGenerals =
                roundRec !== undefined
                  ? roundRec.generalMoves.length +
                    Object.keys(roundRec.failedGenerals ?? {}).length
                  : 0;
              const isRoundComplete =
                roundRec !== undefined &&
                (settledGenerals >= game.generals.length ||
                  rNum < currentPhaseRound ||
                  game.phase.kind === 'reporting' ||
                  game.phase.kind === 'done');
              const isCurrentPhase =
                currentPhaseRound === rNum &&
                game.phase.kind !== 'reporting' &&
                game.phase.kind !== 'done';
              const isSelected = activeViewRound === rNum;

              return (
                <button
                  key={rNum}
                  type="button"
                  onClick={() => onSelectViewRound(rNum)}
                  className={`px-13 py-5 rounded-[3px] font-mono text-label uppercase tracking-[0.12em] border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-mint bg-bg text-mint font-semibold'
                      : isRoundComplete
                        ? 'border-line bg-bg text-text hover:border-mint'
                        : isCurrentPhase
                          ? 'border-line bg-surface text-text'
                          : 'border-line bg-bg text-muted'
                  }`}
                  data-testid={`round-pill-${rNum}`}
                >
                  ROUND {rNum} OF {game.totalRounds}{' '}
                  {isRoundComplete ? '[DONE]' : isCurrentPhase ? '●' : ''}
                </button>
              );
            },
          )}

          {(game.phase.kind === 'reporting' ||
            game.phase.kind === 'done' ||
            game.report !== null) &&
            onViewReport && (
              <button
                type="button"
                onClick={onViewReport}
                className={TOKENS.classes.btnSecondary}
                data-testid="round-pill-report"
              >
                Final verdict report
              </button>
            )}
        </div>

        {/* Running General Scores */}
        <div className="flex flex-wrap items-center gap-8">
          {scores.map((s) => (
            <span
              key={s.generalId}
              className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
              data-testid={`timeline-score-${s.generalId}`}
            >
              {formatPlayerVsGeneralScore(s.name, s.score)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
