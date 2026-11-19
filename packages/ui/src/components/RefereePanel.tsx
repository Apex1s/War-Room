import {
  cleanPunctuation,
  formatPlayerVsGeneralScore,
  formatSignedScore,
  rehydrate,
  type GeneralSpec,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { TOKENS } from '../tokens';
import { SourceBadge } from './SourceBadge';

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
    showRehydrated ? rehydrate(text, vaultMap) : cleanPunctuation(text);

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-13'}
      data-testid={`referee-panel-r${roundNumber}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <span className="terminal-label">
            REFEREE: ROUND {roundNumber} VERDICT
          </span>
          {refereeStatus === 'running' && (
            <span
              className="inline-flex items-center gap-5 font-mono text-label uppercase tracking-[0.12em] text-muted"
              data-testid={`referee-running-r${roundNumber}`}
            >
              <span className="wr-live-dot" aria-hidden="true" />
              <span>
                [THINKING
                <span className="wr-thinking-dots" />]
              </span>
            </span>
          )}
          {refereeStatus === 'skipped' && !referee && (
            <span
              className="font-mono text-label text-muted"
              data-testid={`referee-skipped-r${roundNumber}`}
            >
              REFEREE SKIPPED AFTER RETRY (SCORES CARRIED OVER)
            </span>
          )}
        </div>

        {referee && (
          <SourceBadge
            source={referee.source}
            latencyMs={referee.latencyMs}
            fallback={referee.fallback}
            model={referee.model}
          />
        )}
      </div>

      {referee && (
        <>
          <p
            className="text-body text-text m-0"
            data-testid={`referee-summary-r${roundNumber}`}
          >
            {formatText(referee.summary)}
          </p>

          {/* Contradiction Alert in an Orange-ruled block (§6) */}
          {referee.contradiction.trim().length > 0 && (
            <div
              className="border-l-[3px] border-l-orange pl-13 py-5 bg-bg text-body text-orange"
              data-testid={`referee-contradiction-r${roundNumber}`}
            >
              <div className="font-mono text-label uppercase tracking-[0.12em] text-orange font-semibold mb-3">
                CONTRADICTION DETECTED
              </div>
              <div>{formatText(referee.contradiction)}</div>
            </div>
          )}

          {/* Exchange Score Deltas per General */}
          <div className="flex flex-col gap-8 pt-8 border-t border-line">
            <div className="flex items-center justify-between gap-8">
              <span className="terminal-label">SCORE DELTAS</span>
              <span className="font-mono text-label text-text">
                {referee.scores.map((s) => formatSignedScore(s.delta)).join(' / ')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-8">
              {referee.scores.map((s) => {
                const gen = generals.find((g) => g.id === s.generalId);
                const genName = gen?.name ?? s.generalId;
                return (
                  <span
                    key={s.generalId}
                    className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
                    data-testid={`referee-delta-r${roundNumber}-${s.generalId}`}
                  >
                    {formatPlayerVsGeneralScore(genName, s.delta)}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Active Commitments Ledger */}
      {commitments.length > 0 && (
        <div className="pt-8 border-t border-line flex flex-col gap-5">
          <span className="terminal-label">RECORDED COMMITMENTS</span>
          <div className="flex flex-wrap items-center gap-8">
            {commitments.map((c, idx) => (
              <span
                key={`${idx}-${c}`}
                className="px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
                data-testid={`recorded-commitment-${idx}`}
              >
                "{formatText(c)}"
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
