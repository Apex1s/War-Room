import { getProvider, type Source } from '@warroom/core';
import { TOKENS } from '../tokens';

export interface SourceBadgeProps {
  source: Source;
  latencyMs?: number;
  fallback?: boolean;
}

export function isMockProviderActive(): boolean {
  return getProvider().kind === 'mock';
}

export function SourceBadge({ source, latencyMs, fallback }: SourceBadgeProps) {
  if (isMockProviderActive()) {
    return (
      <span className={TOKENS.classes.badge} data-testid="source-badge">
        <span>🧪 Mock</span>
      </span>
    );
  }

  const isDevice = source === 'on-device';
  return (
    <span className={TOKENS.classes.badge} data-testid="source-badge">
      <span>{isDevice ? '🔒 On-device' : '☁️ Cloud'}</span>
      {latencyMs !== undefined && (
        <span className="text-[#8B9BB4]">· {latencyMs} ms</span>
      )}
      {fallback && <span className="text-[#E0A84B]">· fallback</span>}
    </span>
  );
}
