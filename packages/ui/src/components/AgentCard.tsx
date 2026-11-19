import {
  cleanPunctuation,
  describeScoreStanding,
  formatPlayerVsGeneralScore,
  formatSignedScore,
  rehydrate,
  type AiErrorCode,
  type GeneralMoveOutput,
  type GeneralSpec,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { TOKENS } from '../tokens';
import { SourceBadge } from './SourceBadge';

export interface ThreatMeterProps {
  level: number;
  testId?: string;
}

export function ThreatMeter({ level, testId }: ThreatMeterProps) {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return (
    <div
      className="inline-flex items-center gap-8"
      title={`Threat level ${clamped} of 5`}
      data-testid={testId}
    >
      <div className="inline-flex items-center gap-3" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((cell) => (
          <span
            key={cell}
            className={`inline-block w-13 h-5 rounded-[1px] ${
              cell <= clamped ? 'bg-orange' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-label text-muted">{clamped}/5</span>
    </div>
  );
}

export interface AgentCardProps {
  general: GeneralSpec;
  roundNumber: number;
  reply?: RoundRecord['generalMoves'][number];
  scoreDelta?: number;
  cumulativeScore?: number;
  isPending: boolean;
  failedCode?: AiErrorCode;
  vaultMap: PlaceholderEntry[];
  showRehydrated: boolean;
  busy: boolean;
  onRetryGeneral: (generalId: string) => void;
}

export function AgentCard({
  general,
  roundNumber,
  reply,
  scoreDelta,
  cumulativeScore = 0,
  isPending,
  failedCode,
  vaultMap,
  showRehydrated,
  busy,
  onRetryGeneral,
}: AgentCardProps) {
  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultMap) : cleanPunctuation(text);

  const initials = general.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col justify-between gap-13'}
      data-testid={`general-card-r${roundNumber}-${general.id}`}
    >
      <div className="flex flex-col gap-13">
        {/* Header with 34 px Monogram Square + Name + Role + Threat Meter */}
        <div className="flex flex-wrap items-start justify-between gap-13">
          <div className="flex items-center gap-13 min-w-0">
            <div className="w-34 h-34 rounded-[3px] border border-line bg-bg flex items-center justify-center font-mono text-label font-semibold text-text shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="font-sans text-body font-semibold text-text">
                {general.name}
              </div>
              <div className="text-label text-muted">{general.role}</div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-5 shrink-0">
            {reply && (
              <ThreatMeter
                level={reply.threatLevel}
                testId={`general-threat-r${roundNumber}-${general.id}`}
              />
            )}
            {scoreDelta !== undefined && (
              <span
                className="font-mono text-label text-muted"
                title={formatPlayerVsGeneralScore(general.name, cumulativeScore)}
              >
                You vs {general.name}: {formatSignedScore(cumulativeScore)} (
                {describeScoreStanding(cumulativeScore)}) · R{roundNumber}{' '}
                {formatSignedScore(scoreDelta)}
              </span>
            )}
          </div>
        </div>

        {isPending && (
          <div
            className="py-21 font-mono text-label uppercase tracking-[0.12em] text-muted"
            data-testid={`general-pending-r${roundNumber}-${general.id}`}
          >
            [THINKING
            <span className="wr-thinking-dots" />]
          </div>
        )}

        {failedCode && (
          <div
            className="p-13 rounded-[3px] bg-bg border border-line flex flex-wrap items-center justify-between gap-13"
            data-testid={`general-holds-r${roundNumber}-${general.id}`}
          >
            <div>
              <div className="font-mono text-label uppercase tracking-[0.12em] text-orange font-semibold">
                HOLDS POSITION THIS ROUND
              </div>
              <div className="font-mono text-label text-muted mt-3">
                Cloud call exhausted retries ({failedCode}). The round continues with the other Generals.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRetryGeneral(general.id)}
              disabled={busy}
              className={TOKENS.classes.btnSecondary}
              data-testid={`btn-retry-general-r${roundNumber}-${general.id}`}
            >
              Retry {general.name}
            </button>
          </div>
        )}

        {reply && (
          <>
            <h4
              className="text-title font-semibold text-text m-0"
              data-testid={`general-headline-r${roundNumber}-${general.id}`}
            >
              {formatText(reply.headline)}
            </h4>
            <p
              className="text-body text-text m-0"
              data-testid={`general-move-r${roundNumber}-${general.id}`}
            >
              {formatText(reply.move)}
            </p>
            <div className="text-body text-muted border-t border-line pt-13">
              <span className="terminal-label mr-8">RATIONALE:</span>
              <span>{formatText(reply.rationale)}</span>
            </div>
            {reply.targets && (
              <div className="border-l-[3px] border-l-orange pl-13 py-3 text-label text-muted">
                <span className="font-mono text-label uppercase tracking-[0.12em] text-orange mr-8">
                  TARGETS:
                </span>
                <span>{formatText(reply.targets)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {reply && (
        <div className="pt-13 border-t border-line flex items-center justify-between gap-8">
          <SourceBadge
            source={reply.source}
            latencyMs={reply.latencyMs}
            fallback={reply.fallback}
            model={reply.model}
          />
        </div>
      )}
    </div>
  );
}
export type { GeneralMoveOutput };
