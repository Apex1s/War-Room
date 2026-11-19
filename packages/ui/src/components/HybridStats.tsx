import { useLedger } from '../hooks/useLedger';
import { TOKENS } from '../tokens';

export interface HybridStatsProps {
  gameId?: string;
  rawBriefChars?: number;
  onOpenEgressInspector?: () => void;
}

export function HybridStats({
  gameId,
  rawBriefChars = 0,
  onOpenEgressInspector,
}: HybridStatsProps) {
  const { stats, cloudEntries, blockedRequests } = useLedger(
    gameId,
    rawBriefChars,
  );

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-13'}
      data-testid="hybrid-stats-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-13">
        <div>
          <span className="terminal-label">HYBRID TELEMETRY</span>
          <p className="text-label text-muted mt-3 mb-0">
            Local call ledger across on-device Gemini Nano and cloud models.
          </p>
        </div>

        {onOpenEgressInspector && (
          <button
            type="button"
            onClick={onOpenEgressInspector}
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-open-egress-inspector"
          >
            Inspect cloud egress ({cloudEntries.length} payloads
            {blockedRequests.length > 0
              ? `, ${blockedRequests.length} blocked`
              : ''}
            )
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-13">
        <div
          className="p-13 rounded-[3px] bg-bg border border-line"
          data-testid="stat-on-device-share"
        >
          <div className="terminal-label">CALLS ON-DEVICE</div>
          <div className="text-title font-mono font-semibold text-mint mt-5">
            {stats.onDeviceSharePercent}%
          </div>
          <div className="font-mono text-label text-muted mt-3">
            {stats.onDeviceCalls} on-device / {stats.totalCalls} total
          </div>
        </div>

        <div
          className="p-13 rounded-[3px] bg-bg border border-line"
          data-testid="stat-cloud-avoided"
        >
          <div className="terminal-label">CLOUD CALLS AVOIDED</div>
          <div className="text-title font-mono font-semibold text-text mt-5">
            {stats.cloudCallsAvoided}
          </div>
          <div className="font-mono text-label text-muted mt-3">
            Crowd and referee local
          </div>
        </div>

        <div
          className="p-13 rounded-[3px] bg-bg border border-line"
          data-testid="stat-chars-kept-local"
        >
          <div className="terminal-label">DATA KEPT LOCAL</div>
          <div className="text-title font-mono font-semibold text-text mt-5">
            {stats.charsKeptLocal.toLocaleString()}
          </div>
          <div className="font-mono text-label text-muted mt-3">
            Characters kept on device
          </div>
        </div>

        <div
          className="p-13 rounded-[3px] bg-bg border border-line"
          data-testid="stat-median-latency"
        >
          <div className="terminal-label">MEDIAN LATENCY</div>
          <div className="font-mono text-label text-text mt-8 flex flex-col gap-5">
            <span>
              ● DEVICE:{' '}
              <strong>
                {stats.onDeviceCalls > 0
                  ? `${(stats.medianOnDeviceLatencyMs / 1000).toFixed(1)}S`
                  : 'N/A'}
              </strong>
            </span>
            <span>
              ○ CLOUD:{' '}
              <strong>
                {stats.cloudCalls > 0
                  ? `${(stats.medianCloudLatencyMs / 1000).toFixed(1)}S`
                  : 'N/A'}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
