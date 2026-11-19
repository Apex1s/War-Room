import {
  rehydrate,
  type GeneralSpec,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { SourceBadge } from './SourceBadge';
import { TOKENS } from '../tokens';

export interface RefereePanelProps {
  roundNumber: number;
  referee: RoundRecord['referee'];
  refereeStatus: 'idle' | 'running' | 'done' | 'skipped';
  generals: GeneralSpec[];
  commitments: string[];
  vaultMap: PlaceholderEntry[];
  showRehydrated: boolean;
}

export function RefereePanel({
  roundNumber,
  referee,
  refereeStatus,
  generals,
  commitments,
  vaultMap,
  showRehydrated,
}: RefereePanelProps) {
  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultMap) : text;

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-3'}
      data-testid={`referee-panel-r${roundNumber}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
            ⚖️ Round {roundNumber} Referee Verdict
          </span>
          {refereeStatus === 'running' && (
            <span
              className="text-xs font-mono text-[#8B9BB4] animate-pulse"
              data-testid={`referee-running-r${roundNumber}`}
            >
              · 🔒 Evaluating exchange & commitments…
            </span>
          )}
          {refereeStatus === 'skipped' && !referee && (
            <span
              className="text-xs font-mono text-amber-400"
              data-testid={`referee-skipped-r${roundNumber}`}
            >
              · Referee skipped after retry (scores carried over)
            </span>
          )}
        </div>

        {referee && (
          <SourceBadge
            source={referee.source}
            latencyMs={referee.latencyMs}
            fallback={referee.fallback}
          />
        )}
      </div>

      {referee && (
        <>
          <p
            className="text-sm text-[#E6EDF3] m-0 leading-relaxed"
            data-testid={`referee-summary-r${roundNumber}`}
          >
            {formatText(referee.summary)}
          </p>

          {/* Contradiction Alert */}
          {referee.contradiction.trim().length > 0 && (
            <div
              className="p-3 rounded bg-red-950/50 border border-red-700/70 text-xs font-mono text-red-200 flex items-start gap-2"
              data-testid={`referee-contradiction-r${roundNumber}`}
            >
              <span className="text-red-400 font-bold">⚠️ CONTRADICTION:</span>
              <span>{formatText(referee.contradiction)}</span>
            </div>
          )}

          {/* Exchange Score Deltas per General */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-mono text-[#8B9BB4]">
              Round score delta:
            </span>
            {referee.scores.map((s) => {
              const gen = generals.find((g) => g.id === s.generalId);
              const sign = s.delta > 0 ? `+${s.delta}` : `${s.delta}`;
              return (
                <span
                  key={s.generalId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono"
                  data-testid={`referee-delta-r${roundNumber}-${s.generalId}`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: gen?.color ?? '#E0A84B' }}
                  />
                  <span>{gen?.name ?? s.generalId}:</span>
                  <span
                    className={
                      s.delta > 0
                        ? 'text-emerald-400 font-semibold'
                        : s.delta < 0
                          ? 'text-red-400 font-semibold'
                          : 'text-[#8B9BB4]'
                    }
                  >
                    {sign}
                  </span>
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* Active Commitments Ledger */}
      {commitments.length > 0 && (
        <div className="pt-2 border-t border-[#223049] flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-[#8B9BB4]">
            Recorded player commitments:
          </span>
          {commitments.map((c, idx) => (
            <span
              key={`${idx}-${c}`}
              className="px-2 py-0.5 rounded bg-[#162032] border border-[#223049] text-xs font-mono text-[#E0A84B]"
              data-testid={`recorded-commitment-${idx}`}
            >
              "{formatText(c)}"
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
