import {
  rehydrate,
  type AiErrorCode,
  type GeneralMoveOutput,
  type GeneralSpec,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { SourceBadge } from './SourceBadge';
import { TOKENS } from '../tokens';

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
    showRehydrated ? rehydrate(text, vaultMap) : text;

  const initials = general.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="rounded-lg border border-[#223049] bg-[#0A0E17] p-4 flex flex-col justify-between gap-3 shadow-sm"
      style={{ borderTopWidth: '3px', borderTopColor: general.color }}
      data-testid={`general-card-r${roundNumber}-${general.id}`}
    >
      <div className="flex flex-col gap-2.5">
        {/* Header with Avatar + Name + Threat & Score */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono font-bold text-[#0A0E17] shrink-0"
              style={{ backgroundColor: general.color }}
            >
              {initials}
            </div>
            <div>
              <div className="text-sm font-bold text-[#E6EDF3]">
                {general.name}
              </div>
              <div className="text-[11px] text-[#8B9BB4] line-clamp-1">
                {general.role}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            {reply && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono border ${
                  reply.threatLevel >= 4
                    ? 'bg-red-950/60 border-red-700/60 text-red-300'
                    : reply.threatLevel === 3
                      ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                      : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                }`}
                data-testid={`general-threat-r${roundNumber}-${general.id}`}
              >
                Threat {reply.threatLevel}/5
              </span>
            )}
            {scoreDelta !== undefined && (
              <span
                className="text-[11px] font-mono text-[#8B9BB4]"
                title="Player exchange score delta from the Referee"
              >
                Round:{' '}
                <span
                  className={
                    scoreDelta > 0
                      ? 'text-emerald-400'
                      : scoreDelta < 0
                        ? 'text-red-400'
                        : 'text-[#E6EDF3]'
                  }
                >
                  {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                </span>{' '}
                (Total {cumulativeScore > 0 ? `+${cumulativeScore}` : cumulativeScore})
              </span>
            )}
          </div>
        </div>

        {isPending && (
          <div
            className="py-6 text-xs font-mono text-[#8B9BB4] animate-pulse"
            data-testid={`general-pending-r${roundNumber}-${general.id}`}
          >
            ☁️ Generating adversarial move in parallel…
          </div>
        )}

        {failedCode && (
          <div className="p-3 rounded bg-red-950/40 border border-red-800/60 flex flex-col gap-2">
            <div className="text-xs font-mono text-red-300">
              Failed ({failedCode})
            </div>
            <button
              type="button"
              onClick={() => onRetryGeneral(general.id)}
              disabled={busy}
              className={TOKENS.classes.btnSecondary + ' text-xs'}
              data-testid={`btn-retry-general-r${roundNumber}-${general.id}`}
            >
              ↻ Retry {general.name}
            </button>
          </div>
        )}

        {reply && (
          <>
            <div
              className="text-sm font-semibold text-[#E6EDF3] leading-snug"
              data-testid={`general-headline-r${roundNumber}-${general.id}`}
            >
              {formatText(reply.headline)}
            </div>
            <div
              className="text-xs text-[#E6EDF3]/90 leading-relaxed font-mono"
              data-testid={`general-move-r${roundNumber}-${general.id}`}
            >
              {formatText(reply.move)}
            </div>
            <div className="text-xs text-[#8B9BB4] border-t border-[#223049] pt-2">
              <span className="font-mono text-[#E0A84B]">Rationale:</span>{' '}
              {formatText(reply.rationale)}
            </div>
            {reply.targets && (
              <div className="text-xs text-[#8B9BB4]">
                <span className="font-mono text-[#8B9BB4]">Targets assumption:</span>{' '}
                {formatText(reply.targets)}
              </div>
            )}
          </>
        )}
      </div>

      {reply && (
        <div className="pt-2 border-t border-[#223049] flex items-center justify-between gap-2">
          <SourceBadge
            source={reply.source}
            latencyMs={reply.latencyMs}
            fallback={reply.fallback}
          />
          <span className="text-[11px] font-mono text-[#8B9BB4] truncate">
            {reply.model}
          </span>
        </div>
      )}
    </div>
  );
}
export type { GeneralMoveOutput };
