import {
  computeCrowdSentimentAverage,
  rehydrate,
  selectRoundPersonas,
  type CrowdPersona,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { SourceBadge } from './SourceBadge';
import { TOKENS } from '../tokens';

export interface CrowdWallProps {
  roundNumber: number;
  allPersonas: CrowdPersona[];
  reactions: RoundRecord['crowd'];
  crowdStatus: 'idle' | 'running' | 'done';
  vaultMap: PlaceholderEntry[];
  showRehydrated: boolean;
}

export function CrowdWall({
  roundNumber,
  allPersonas,
  reactions,
  crowdStatus,
  vaultMap,
  showRehydrated,
}: CrowdWallProps) {
  const rotatingPersonas = selectRoundPersonas(allPersonas, roundNumber);
  const personaMap = new Map(allPersonas.map((p) => [p.id, p]));
  const avgSentiment = computeCrowdSentimentAverage(reactions);
  const firstReaction = reactions[0];

  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultMap) : text;

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-3'}
      data-testid={`crowd-wall-r${roundNumber}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
            👥 The Crowd — 5 Rotating Personas (Round {roundNumber})
          </span>
          {avgSentiment !== null && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono border ${
                avgSentiment > 0
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                  : avgSentiment < 0
                    ? 'bg-red-950/60 border-red-700/60 text-red-300'
                    : 'bg-[#0A0E17] border-[#223049] text-[#8B9BB4]'
              }`}
              data-testid={`crowd-avg-sentiment-r${roundNumber}`}
            >
              Avg sentiment: {avgSentiment > 0 ? `+${avgSentiment}` : avgSentiment}
            </span>
          )}
          {crowdStatus === 'running' && (
            <span
              className="text-xs font-mono text-[#8B9BB4] animate-pulse"
              data-testid={`crowd-running-r${roundNumber}`}
            >
              · 🔒 Batched call running in background (never blocks Next Round)…
            </span>
          )}
        </div>

        {firstReaction && (
          <SourceBadge
            source={firstReaction.source}
            latencyMs={firstReaction.latencyMs}
            fallback={firstReaction.fallback}
          />
        )}
      </div>

      {reactions.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {reactions.map((rx) => {
            const persona = personaMap.get(rx.personaId);
            const sign = rx.sentiment > 0 ? `+${rx.sentiment}` : `${rx.sentiment}`;
            return (
              <div
                key={rx.personaId}
                className="p-3 rounded bg-[#0A0E17] border border-[#223049] flex flex-col justify-between gap-2"
                data-testid={`crowd-card-r${roundNumber}-${rx.personaId}`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-xs font-semibold text-[#E6EDF3] leading-tight">
                      {persona?.label ?? rx.personaId}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono shrink-0 ${
                        rx.sentiment > 0
                          ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/50'
                          : rx.sentiment < 0
                            ? 'bg-red-950/70 text-red-300 border border-red-700/50'
                            : 'bg-[#162032] text-[#8B9BB4] border border-[#223049]'
                      }`}
                    >
                      {sign}
                    </span>
                  </div>
                  <p className="text-xs text-[#E6EDF3]/90 font-mono m-0 leading-relaxed">
                    "{formatText(rx.quote)}"
                  </p>
                </div>

                <div className="pt-1.5 border-t border-[#223049]/60 flex items-center justify-between">
                  <SourceBadge
                    source={rx.source}
                    latencyMs={rx.latencyMs}
                    fallback={rx.fallback}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {rotatingPersonas.map((p) => (
            <div
              key={p.id}
              className="p-3 rounded bg-[#0A0E17]/60 border border-[#223049]/60 flex flex-col gap-1"
            >
              <span className="text-xs font-semibold text-[#8B9BB4]">
                {p.label}
              </span>
              <span className="text-[11px] text-[#8B9BB4]/70 font-mono">
                {crowdStatus === 'running' ? 'Reacting…' : p.outlook}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
