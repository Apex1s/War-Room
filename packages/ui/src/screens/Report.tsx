import {
  cleanPunctuation,
  computeGeneralScores,
  dispatchAndPersist,
  formatPlayerVsGeneralScore,
  rehydrate,
  runFinalReportEffect,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { useEffect, useRef, useState } from 'react';
import { HybridStats } from '../components/HybridStats';
import { SourceBadge } from '../components/SourceBadge';
import { TOKENS } from '../tokens';

export interface ReportScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onBackToWarRoom: () => void;
  onOpenEgressInspector?: () => void;
}

const VERDICT_META: Record<
  'plan_holds' | 'holds_with_changes' | 'plan_breaks',
  { label: string; chipClass: string }
> = {
  plan_holds: {
    label: 'PLAN HOLDS',
    chipClass: 'border-mint text-mint',
  },
  holds_with_changes: {
    label: 'HOLDS WITH CHANGES',
    chipClass: 'border-line text-text',
  },
  plan_breaks: {
    label: 'PLAN BREAKS',
    chipClass: 'border-orange text-orange',
  },
};

export function ReportScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onBackToWarRoom,
  onOpenEgressInspector,
}: ReportScreenProps) {
  const [showRehydrated, setShowRehydrated] = useState<boolean>(true);
  const [retrying, setRetrying] = useState<boolean>(false);
  const runningRef = useRef<boolean>(false);

  useEffect(() => {
    if (game.phase.kind === 'reporting' && !runningRef.current) {
      runningRef.current = true;
      void runFinalReportEffect(game, vaultRecord, {
        onStateChange: (nextGame, nextVault) => {
          onGameUpdated(nextGame, nextVault);
        },
      }).finally(() => {
        runningRef.current = false;
      });
    }
  }, [game, vaultRecord, onGameUpdated]);

  const handleRetryReport = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      let nextGame = game;
      if (game.phase.kind === 'failed') {
        nextGame = await dispatchAndPersist(
          game,
          vaultRecord,
          { type: 'RETRY' },
          { onStateChange: onGameUpdated },
        );
      }
      const res = await runFinalReportEffect(nextGame, vaultRecord, {
        onStateChange: onGameUpdated,
      });
      onGameUpdated(res.game, res.vaultRecord);
    } finally {
      setRetrying(false);
    }
  };

  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultRecord.map) : cleanPunctuation(text);

  const scores = computeGeneralScores(game.generals, game.rounds);
  const report = game.report;

  if (
    game.phase.kind === 'reporting' ||
    (!report && game.phase.kind !== 'failed')
  ) {
    return (
      <div
        className={
          TOKENS.classes.card +
          ' flex flex-col items-center justify-center py-55 gap-13'
        }
        data-testid="screen-report-loading"
      >
        <div className="font-mono text-label uppercase tracking-[0.12em] text-muted">
          [THINKING
          <span className="wr-thinking-dots" />] SYNTHESIZING FINAL VERDICT REPORT
        </div>
        <p className="text-body text-muted max-w-md text-center m-0">
          Analyzing all {game.totalRounds} rounds of abstracted moves, General counter-moves, crowd sentiment and referee commitments. Real names will be re-hydrated locally on your device.
        </p>
      </div>
    );
  }

  if (game.phase.kind === 'failed' && !report) {
    return (
      <div
        className={TOKENS.classes.card + ' flex flex-col gap-13'}
        data-testid="screen-report-failed"
      >
        <div className="font-mono text-label uppercase tracking-[0.12em] text-orange">
          FINAL REPORT GENERATION FAILED ({game.phase.code})
        </div>
        <div className="flex flex-wrap items-center gap-13">
          <button
            type="button"
            onClick={() => void handleRetryReport()}
            disabled={retrying}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-retry-report"
          >
            {retrying ? 'Retrying final report...' : 'Retry final report'}
          </button>
          <button
            type="button"
            onClick={onBackToWarRoom}
            className={TOKENS.classes.btnSecondary}
          >
            Back to rounds
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const verdictInfo = VERDICT_META[report.verdict];

  return (
    <div className="flex flex-col gap-21" data-testid="screen-report">
      {/* Top Bar: Back + Re-hydration Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-13">
        <button
          type="button"
          onClick={onBackToWarRoom}
          className={TOKENS.classes.btnSecondary}
          data-testid="btn-back-to-rounds"
        >
          Replay rounds and offline what-if
        </button>

        <button
          type="button"
          onClick={() => setShowRehydrated((prev) => !prev)}
          className={TOKENS.classes.btnSecondary}
          data-testid="btn-report-toggle-rehydration"
        >
          {showRehydrated
            ? 'Showing real names (re-hydrated on-device)'
            : 'Showing abstracted tokens (stored cloud view)'}
        </button>
      </div>

      {/* Golden-ratio 61.8% / 38.2% split (docs/04-design-system.md §3) */}
      <div className="wr-split-golden">
        {/* Left Column (61.8%): Verdict, Top 3 Risks, Hidden Info Dossier */}
        <div className="flex flex-col gap-13 min-w-0">
          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="report-verdict-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-13">
              <div className="flex flex-wrap items-center gap-8">
                <span
                  className={`px-8 py-3 rounded-[3px] font-mono text-label uppercase tracking-[0.12em] font-semibold border bg-bg ${verdictInfo.chipClass}`}
                  data-testid="report-verdict-badge"
                >
                  {verdictInfo.label}
                </span>
                <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
                  CONFIDENCE: <strong className="text-text">{report.confidence}</strong>
                </span>
              </div>

              <SourceBadge
                source={report.source}
                latencyMs={report.latencyMs}
                fallback={report.fallback}
                model={report.model}
              />
            </div>

            <h1
              className="text-display font-semibold text-text m-0"
              data-testid="report-verdict-line"
            >
              {formatText(report.verdictLine)}
            </h1>

            <p
              className="text-body text-text m-0"
              data-testid="report-summary"
            >
              {formatText(report.summary)}
            </p>
          </div>

          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="report-risks-section"
          >
            <div className="terminal-label">TOP 3 STRATEGIC RISKS EXPOSED</div>
            <div className="flex flex-col gap-13">
              {report.risks.map((risk, idx) => (
                <div
                  key={idx}
                  className="p-13 rounded-[3px] bg-bg border border-line border-l-[3px] border-l-orange flex flex-col gap-8"
                  data-testid={`report-risk-${idx + 1}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-8">
                    <span className="text-title font-semibold text-text">
                      #{idx + 1} · {formatText(risk.title)}
                    </span>
                    <span
                      className={`px-8 py-3 rounded-[3px] font-mono text-label uppercase border ${
                        risk.severity === 'high'
                          ? 'border-orange text-orange'
                          : 'border-line text-muted'
                      }`}
                    >
                      {risk.severity}
                    </span>
                  </div>
                  <p className="text-body text-text m-0">
                    {formatText(risk.detail)}
                  </p>
                  <span className="font-mono text-label text-muted">
                    RAISED BY: <strong className="text-text">{risk.raisedBy}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="report-hidden-info-reveal"
          >
            <div>
              <span className="terminal-label">DECLASSIFIED DOSSIER</span>
              <h3 className="text-title font-semibold text-text mt-5 mb-0">
                What your opponents knew
              </h3>
              <p className="text-body text-muted mt-5 mb-0">
                During the war game, each General acted on private incentives and market data hidden from you.
              </p>
            </div>

            <div className="flex flex-col gap-13">
              {game.generals.map((gen) => {
                const scoreEntry = scores.find((s) => s.generalId === gen.id);
                const score = scoreEntry?.score ?? 0;
                const initials = gen.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={gen.id}
                    className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-13"
                    data-testid={`hidden-info-card-${gen.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-8">
                      <div className="flex items-center gap-13">
                        <div className="w-34 h-34 rounded-[3px] border border-line bg-surface flex items-center justify-center font-mono text-label font-semibold text-text">
                          {initials}
                        </div>
                        <div>
                          <div className="font-sans text-body font-semibold text-text">
                            {gen.name}
                          </div>
                          <div className="text-label text-muted">
                            {cleanPunctuation(gen.goal)}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-label text-text">
                        {formatPlayerVsGeneralScore(gen.name, score)}
                      </span>
                    </div>

                    <div className="p-13 rounded-[3px] bg-surface border border-line text-body text-text">
                      <span className="terminal-label block mb-5">
                        HIDDEN AGENDA AND PRIVATE INTEL
                      </span>
                      {formatText(gen.hiddenInfo)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (38.2%): Top 3 Counter-Strategies, Next Steps, Hybrid Telemetry */}
        <div className="flex flex-col gap-13 min-w-0">
          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="report-counters-section"
          >
            <div className="terminal-label">TOP 3 COUNTER-STRATEGIES</div>
            <div className="flex flex-col gap-13">
              {report.counterStrategies.map((cs, idx) => (
                <div
                  key={idx}
                  className="p-13 rounded-[3px] bg-bg border border-line border-l-[3px] border-l-mint flex flex-col gap-8"
                  data-testid={`report-counter-${idx + 1}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-8">
                    <span className="font-sans text-body font-semibold text-text">
                      {formatText(cs.title)}
                    </span>
                    <span className="px-8 py-3 rounded-[3px] font-mono text-label bg-surface text-mint border border-line shrink-0">
                      ADDRESSES RISK #{cs.addressesRisk}
                    </span>
                  </div>
                  <p className="text-body text-text m-0">
                    {formatText(cs.detail)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="report-next-steps"
          >
            <div className="terminal-label">CONCRETE NEXT STEPS</div>
            <ol className="m-0 pl-21 flex flex-col gap-8 text-body text-text">
              {report.nextSteps.map((step, idx) => (
                <li key={idx}>{formatText(step)}</li>
              ))}
            </ol>
          </div>

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
