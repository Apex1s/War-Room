import { getProvider, type Source } from '@warroom/core';

export interface SourceBadgeProps {
  source: Source;
  latencyMs?: number;
  fallback?: boolean;
  model?: string;
}

export function isMockProviderActive(): boolean {
  return getProvider().kind === 'mock';
}

function formatSeconds(latencyMs?: number): string | null {
  if (latencyMs === undefined) return null;
  return `${(latencyMs / 1000).toFixed(1)}S`;
}

export function SourceBadge({
  source,
  latencyMs,
  fallback,
  model,
}: SourceBadgeProps) {
  if (isMockProviderActive()) {
    return (
      <span
        className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] font-mono text-label uppercase border border-dashed border-line bg-surface text-muted whitespace-nowrap"
        data-testid="source-badge"
      >
        <span>MOCK</span>
      </span>
    );
  }

  const isDevice = source === 'on-device';
  const sec = formatSeconds(latencyMs);

  if (isDevice) {
    return (
      <span
        className="inline-flex flex-wrap items-center gap-5 px-8 py-3 rounded-[3px] font-mono text-label uppercase border border-mint bg-surface text-mint"
        data-testid="source-badge"
      >
        <span className="inline-flex items-center gap-5 whitespace-nowrap">
          <span aria-hidden="true">●</span>
          <span>ON-DEVICE{sec ? ` ${sec}` : ''}</span>
          {model && <span className="text-muted">·</span>}
        </span>
        {model && (
          <span className="text-muted whitespace-nowrap">
            {model}
            {fallback ? ' ·' : ''}
          </span>
        )}
        {fallback && (
          <span className="text-muted whitespace-nowrap">FALLBACK</span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex flex-wrap items-center gap-5 px-8 py-3 rounded-[3px] font-mono text-label uppercase border border-line bg-surface text-text"
      data-testid="source-badge"
    >
      <span className="inline-flex items-center gap-5 whitespace-nowrap">
        <span aria-hidden="true">○</span>
        <span>CLOUD{sec ? ` ${sec}` : ''}</span>
        {model && <span className="text-muted">·</span>}
      </span>
      {model && (
        <span className="text-muted whitespace-nowrap">
          {model}
          {fallback ? ' ·' : ''}
        </span>
      )}
      {fallback && (
        <span className="text-muted whitespace-nowrap">FALLBACK</span>
      )}
    </span>
  );
}
