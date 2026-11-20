import {
  cleanPunctuation,
  computeCrowdSentimentAverage,
  rehydrate,
  selectRoundPersonas,
  type CrowdPersona,
  type PlaceholderEntry,
  type RoundRecord,
} from '@warroom/core';
import { TOKENS } from '../tokens';
import { SourceBadge } from './SourceBadge';

export interface CrowdWallProps {
  roundNumber: number;
  allPersonas: CrowdPersona[];
  reactions: RoundRecord['crowd'];
  crowdStatus: 'idle' | 'running' | 'done';
  vaultMap: PlaceholderEntry[];
  showRehydrated: boolean;
}

function SentimentBar({ sentiment }: { sentiment: number }) {
  // 5-step bar for -2..+2: steps 1..5 correspond to -2, -1, 0, +1, +2
  const clamped = Math.max(-2, Math.min(2, Math.round(sentiment)));
  const activeStep = clamped + 3; // 1..5
  const sign = clamped > 0 ? `+${clamped}` : `${clamped}`;

  return (
    <div
      className="inline-flex items-center gap-8"
      title={`Sentiment ${sign}`}
    >
      <div className="inline-flex items-center gap-3" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => {
          let colorClass = 'bg-line';
          if (clamped > 0 && step >= 3 && step <= activeStep) {
            colorClass = 'bg-mint';
          } else if (clamped < 0 && step <= 3 && step >= activeStep) {
            colorClass = 'bg-orange';
          } else if (clamped === 0 && step === 3) {
            colorClass = 'bg-line';
          }
          return (
            <span
              key={step}
              className={`inline-block w-8 h-5 rounded-[1px] ${colorClass}`}
            />
          );
        })}
      </div>
      <span
        className={`font-mono text-label ${
          clamped > 0
            ? 'text-mint'
            : clamped < 0
              ? 'text-orange'
              : 'text-muted'
        }`}
      >
        {sign}
      </span>
    </div>
  );
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
    showRehydrated ? rehydrate(text, vaultMap) : cleanPunctuation(text);

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-13'}
      data-testid={`crowd-wall-r${roundNumber}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <span className="terminal-label">
            THE CROWD: 5 ROTATING PERSONAS (ROUND {roundNumber})
          </span>
          {avgSentiment !== null && (
            <span
              className="px-8 py-3 rounded-[3px] font-mono text-label border border-line bg-bg text-text"
              data-testid={`crowd-avg-sentiment-r${roundNumber}`}
            >
              AVG SENTIMENT:{' '}
              {avgSentiment > 0 ? `+${avgSentiment}` : avgSentiment}
            </span>
          )}
          {crowdStatus === 'running' && reactions.length === 0 && (
            <span
              className="inline-flex items-center gap-5 font-mono text-label uppercase tracking-[0.12em] text-muted"
              data-testid={`crowd-running-r${roundNumber}`}
            >
              <span className="wr-live-dot" aria-hidden="true" />
              <span>
                [THINKING
                <span className="wr-thinking-dots" />]
              </span>
            </span>
          )}
        </div>

        {firstReaction && (
          <SourceBadge
            source={firstReaction.source}
            latencyMs={firstReaction.latencyMs}
            fallback={firstReaction.fallback}
            model={firstReaction.model}
          />
        )}
      </div>

      {reactions.length > 0 ? (
        <div className="flex flex-col gap-13">
          {reactions.map((rx) => {
            const persona = personaMap.get(rx.personaId);
            return (
              <div
                key={rx.personaId}
                className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-8"
                data-testid={`crowd-card-r${roundNumber}-${rx.personaId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <span className="font-sans text-label font-semibold text-text">
                    {persona?.label ?? rx.personaId}
                  </span>
                  <SentimentBar sentiment={rx.sentiment} />
                </div>
                <p className="text-body text-text m-0">
                  "{formatText(rx.quote)}"
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {rotatingPersonas.map((p) => (
            <div
              key={p.id}
              className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-5"
            >
              <span className="font-sans text-label font-semibold text-muted">
                {p.label}
              </span>
              <span className="font-mono text-label text-muted">
                {crowdStatus === 'running'
                  ? '[THINKING...]'
                  : crowdStatus === 'done'
                    ? 'Crowd unavailable this round'
                    : cleanPunctuation(p.outlook)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
