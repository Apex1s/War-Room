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
      className={TOKENS.classes.card + ' flex flex-col gap-4'}
      data-testid="round-timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              🔒 Vault Sealed ({maskedCount} secrets kept on-device)
            </span>
            <span className="text-xs font-mono text-[#8B9BB4]">·</span>
            <span
              className="text-xs font-mono text-[#E0A84B]"
              data-testid="game-phase-badge"
            >
              {formatPhaseStatus(game.phase, game.totalRounds)}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-[#E6EDF3] mt-1 mb-0">
            Situation Room — Multi-Agent Stress Test
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleRehydrated}
            className="px-3 py-1.5 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B]/60 cursor-pointer"
            data-testid="btn-toggle-rehydration"
          >
            {showRehydrated
              ? '👁️ Real Names (Local Re-hydration)'
              : '🛡️ Abstracted Tokens (Cloud View)'}
          </button>

          <button
            type="button"
            onClick={onBackToReview}
            className={TOKENS.classes.btnSecondary + ' text-xs py-1.5'}
            data-testid="btn-return-review"
          >
            ← Firewall Map
          </button>
        </div>
      </div>

      {/* Round pills + Final Report pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#223049]">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: game.totalRounds }, (_, i) => i + 1).map((rNum) => {
            const roundRec = game.rounds.find((r) => r.n === rNum);
            const hasAllGenerals =
              roundRec !== undefined &&
              roundRec.generalMoves.length === game.generals.length;
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
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#E0A84B]/20 border-[#E0A84B] text-[#E0A84B] font-semibold'
                    : hasAllGenerals
                      ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300 hover:border-emerald-500'
                      : isCurrentPhase
                        ? 'bg-[#162032] border-[#E0A84B]/60 text-[#E6EDF3]'
                        : 'bg-[#0A0E17] border-[#223049] text-[#8B9BB4]'
                }`}
                data-testid={`round-pill-${rNum}`}
              >
                Round {rNum}{' '}
                {hasAllGenerals ? '✓' : isCurrentPhase ? '●' : ''}
              </button>
            );
          })}

          {(game.phase.kind === 'reporting' ||
            game.phase.kind === 'done' ||
            game.report !== null) &&
            onViewReport && (
              <button
                type="button"
                onClick={onViewReport}
                className="px-3 py-1.5 rounded text-xs font-mono border border-[#E0A84B] bg-[#E0A84B] text-[#0A0E17] font-semibold cursor-pointer"
                data-testid="round-pill-report"
              >
                Final Verdict Report →
              </button>
            )}
        </div>

        {/* Running General Scores */}
        <div className="flex flex-wrap items-center gap-2">
          {scores.map((s) => {
            const gen = game.generals.find((g) => g.id === s.generalId);
            return (
              <span
                key={s.generalId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono"
                data-testid={`timeline-score-${s.generalId}`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: gen?.color ?? '#E0A84B' }}
                />
                <span
                  className={
                    s.score > 0
                      ? 'text-emerald-400 font-semibold'
                      : s.score < 0
                        ? 'text-red-400 font-semibold'
                        : 'text-[#E6EDF3]'
                  }
                >
                  {formatPlayerVsGeneralScore(s.name, s.score)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
