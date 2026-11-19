import {
  computeGeneralScores,
  dispatchAndPersist,
  formatPlayerVsGeneralScore,
  rehydrate,
  runFinalReportEffect,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { useEffect, useRef, useState } from 'react';
import { isMockProviderActive, SourceBadge } from '../components/SourceBadge';
import { TOKENS } from '../tokens';

export interface ReportScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onBackToWarRoom: () => void;
}

const VERDICT_META: Record<
  'plan_holds' | 'holds_with_changes' | 'plan_breaks',
  { label: string; badgeClass: string; borderClass: string }
> = {
  plan_holds: {
    label: 'PLAN HOLDS',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-600',
    borderClass: 'border-emerald-600/60',
  },
  holds_with_changes: {
    label: 'HOLDS WITH CHANGES',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-500',
    borderClass: 'border-amber-500/60',
  },
  plan_breaks: {
    label: 'PLAN BREAKS',
    badgeClass: 'bg-red-950/80 text-red-300 border-red-600',
    borderClass: 'border-red-600/60',
  },
};

export function ReportScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onBackToWarRoom,
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
    showRehydrated ? rehydrate(text, vaultRecord.map) : text;

  const scores = computeGeneralScores(game.generals, game.rounds);
  const report = game.report;

  if (game.phase.kind === 'reporting' || (!report && game.phase.kind !== 'failed')) {
    return (
      <div
        className={TOKENS.classes.card + ' flex flex-col items-center justify-center py-12 gap-4'}
        data-testid="screen-report-loading"
      >
        <div className="text-sm font-mono uppercase tracking-wider text-[#E0A84B] animate-pulse">
          ☁️ Synthesizing Final After-Action Verdict Report…
        </div>
        <p className="text-xs font-mono text-[#8B9BB4] max-w-md text-center m-0">
          Analyzing all {game.totalRounds} rounds of abstracted moves, General counter-moves,
          crowd sentiment, and referee commitments. Real names will be re-hydrated locally on your device.
        </p>
      </div>
    );
  }

  if (game.phase.kind === 'failed' && !report) {
    return (
      <div
        className={TOKENS.classes.card + ' flex flex-col gap-4'}
        data-testid="screen-report-failed"
      >
        <div className="text-sm font-mono text-red-400">
          Final report generation failed ({game.phase.code}).
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRetryReport()}
            disabled={retrying}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-retry-report"
          >
            {retrying ? 'Retrying Final Report…' : '↻ Retry Final Report'}
          </button>
          <button
            type="button"
            onClick={onBackToWarRoom}
            className={TOKENS.classes.btnSecondary}
          >
            ← Back to Rounds
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const verdictInfo = VERDICT_META[report.verdict];

  return (
    <div className="flex flex-col gap-6" data-testid="screen-report">
      {/* Top Bar: Back + Re-hydration Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToWarRoom}
          className={TOKENS.classes.btnSecondary + ' text-xs'}
          data-testid="btn-back-to-rounds"
        >
          🔁 Replay Rounds & Offline What-If
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRehydrated((prev) => !prev)}
            className="px-3 py-1.5 rounded text-xs font-mono border border-[#E0A84B]/60 bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B] cursor-pointer"
            data-testid="btn-report-toggle-rehydration"
          >
            {showRehydrated
              ? '👁️ Showing Real Names (Re-hydrated On-Device)'
              : '🛡️ Showing Abstracted Tokens (Stored Cloud View)'}
          </button>
        </div>
      </div>

      {/* Verdict Banner */}
      <div
        className={`${TOKENS.classes.card} border-2 ${verdictInfo.borderClass} flex flex-col gap-4`}
        data-testid="report-verdict-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-xs font-mono font-bold border ${verdictInfo.badgeClass}`}
              data-testid="report-verdict-badge"
            >
              {verdictInfo.label}
            </span>
            <span className="text-xs font-mono text-[#8B9BB4]">
              Confidence:{' '}
              <strong className="text-[#E6EDF3] uppercase">
                {report.confidence}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <SourceBadge
              source={report.source}
              latencyMs={report.latencyMs}
              fallback={report.fallback}
            />
            {!isMockProviderActive() && (
              <span className="text-xs font-mono text-[#8B9BB4]">
                {report.model}
              </span>
            )}
          </div>
        </div>

        <h2
          className="text-xl font-bold text-[#E6EDF3] m-0 leading-snug"
          data-testid="report-verdict-line"
        >
          {formatText(report.verdictLine)}
        </h2>

        <p
          className="text-sm text-[#E6EDF3]/90 m-0 leading-relaxed"
          data-testid="report-summary"
        >
          {formatText(report.summary)}
        </p>
      </div>

      {/* Top 3 Risks & Top 3 Counter-Strategies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          className={TOKENS.classes.card + ' flex flex-col gap-3'}
          data-testid="report-risks-section"
        >
          <h3 className="text-sm font-mono uppercase tracking-wider text-red-400 m-0">
            ⚠️ Top 3 Strategic Risks Exposed
          </h3>
          <div className="flex flex-col gap-3">
            {report.risks.map((risk, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded bg-[#0A0E17] border border-[#223049] flex flex-col gap-1.5"
                data-testid={`report-risk-${idx + 1}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-[#E6EDF3]">
                    #{idx + 1} · {formatText(risk.title)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase shrink-0 ${
                      risk.severity === 'high'
                        ? 'bg-red-950/70 text-red-300 border border-red-700/60'
                        : risk.severity === 'medium'
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-700/60'
                          : 'bg-[#162032] text-[#8B9BB4] border border-[#223049]'
                    }`}
                  >
                    {risk.severity}
                  </span>
                </div>
                <p className="text-xs text-[#E6EDF3]/90 font-mono m-0 leading-relaxed">
                  {formatText(risk.detail)}
                </p>
                <span className="text-[11px] font-mono text-[#8B9BB4]">
                  Raised by: <strong className="text-[#E0A84B]">{risk.raisedBy}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className={TOKENS.classes.card + ' flex flex-col gap-3'}
          data-testid="report-counters-section"
        >
          <h3 className="text-sm font-mono uppercase tracking-wider text-emerald-400 m-0">
            🛡️ Top 3 Counter-Strategies
          </h3>
          <div className="flex flex-col gap-3">
            {report.counterStrategies.map((cs, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded bg-[#0A0E17] border border-[#223049] flex flex-col gap-1.5"
                data-testid={`report-counter-${idx + 1}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-[#E6EDF3]">
                    {formatText(cs.title)}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#162032] text-[#E0A84B] border border-[#223049] shrink-0">
                    Addresses Risk #{cs.addressesRisk}
                  </span>
                </div>
                <p className="text-xs text-[#E6EDF3]/90 font-mono m-0 leading-relaxed">
                  {formatText(cs.detail)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Concrete Next Steps */}
      <div
        className={TOKENS.classes.card + ' flex flex-col gap-3'}
        data-testid="report-next-steps"
      >
        <h3 className="text-sm font-mono uppercase tracking-wider text-[#E0A84B] m-0">
          → Concrete Next Steps (Before You Commit)
        </h3>
        <ol className="m-0 pl-5 flex flex-col gap-2 text-sm text-[#E6EDF3] font-mono">
          {report.nextSteps.map((step, idx) => (
            <li key={idx} className="leading-relaxed">
              {formatText(step)}
            </li>
          ))}
        </ol>
      </div>

      {/* "What your opponents knew" Hidden Info Reveal */}
      <div
        className={TOKENS.classes.card + ' flex flex-col gap-4'}
        data-testid="report-hidden-info-reveal"
      >
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
            Declassified Dossier
          </span>
          <h3 className="text-base font-semibold text-[#E6EDF3] mt-0.5 mb-0">
            What Your Opponents Knew (Hidden Information Reveal)
          </h3>
          <p className="text-xs text-[#8B9BB4] mt-1 mb-0">
            During the war game, each General acted on private incentives and market data hidden from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {game.generals.map((gen) => {
            const scoreEntry = scores.find((s) => s.generalId === gen.id);
            const score = scoreEntry?.score ?? 0;
            return (
              <div
                key={gen.id}
                className="p-4 rounded bg-[#0A0E17] border border-[#223049] flex flex-col justify-between gap-3"
                style={{ borderTopWidth: '3px', borderTopColor: gen.color }}
                data-testid={`hidden-info-card-${gen.id}`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-[#E6EDF3]">
                      {gen.name}
                    </span>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        score > 0
                          ? 'text-emerald-400'
                          : score < 0
                            ? 'text-red-400'
                            : 'text-[#8B9BB4]'
                      }`}
                    >
                      {formatPlayerVsGeneralScore(gen.name, score)}
                    </span>
                  </div>
                  <div className="text-xs text-[#8B9BB4]">{gen.goal}</div>
                  <div className="p-2.5 rounded bg-[#111826] border border-[#223049] text-xs font-mono text-[#E6EDF3]">
                    <span className="text-[#E0A84B] block mb-1">
                      🔒 Hidden Agenda & Private Intel:
                    </span>
                    {formatText(gen.hiddenInfo)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
