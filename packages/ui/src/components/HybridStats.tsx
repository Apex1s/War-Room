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
      className={TOKENS.classes.card + ' flex flex-col gap-3'}
      data-testid="hybrid-stats-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
            ⚡ Hybrid Inference Telemetry (Local Call Ledger)
          </span>
          <p className="text-xs text-[#8B9BB4] mt-0.5 mb-0">
            Firebase Console AI monitoring only sees cloud calls; this ledger tracks both on-device Gemini Nano and cloud calls locally.
          </p>
        </div>

        {onOpenEgressInspector && (
          <button
            type="button"
            onClick={onOpenEgressInspector}
            className={TOKENS.classes.btnSecondary + ' text-xs py-1.5'}
            data-testid="btn-open-egress-inspector"
          >
            🔍 Inspect Cloud Egress ({cloudEntries.length} payloads
            {blockedRequests.length > 0
              ? ` · ${blockedRequests.length} blocked`
              : ''}
            )
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div
          className="p-3 rounded bg-[#0A0E17] border border-[#223049]"
          data-testid="stat-on-device-share"
        >
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Calls On-Device
          </div>
          <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
            {stats.onDeviceSharePercent}%
          </div>
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            {stats.onDeviceCalls} on-device / {stats.totalCalls} total
          </div>
        </div>

        <div
          className="p-3 rounded bg-[#0A0E17] border border-[#223049]"
          data-testid="stat-cloud-avoided"
        >
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Cloud Calls Avoided
          </div>
          <div className="text-lg font-mono font-bold text-[#E0A84B] mt-0.5">
            {stats.cloudCallsAvoided}
          </div>
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Crowd & Referee answered locally
          </div>
        </div>

        <div
          className="p-3 rounded bg-[#0A0E17] border border-[#223049]"
          data-testid="stat-chars-kept-local"
        >
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Data Kept Local
          </div>
          <div className="text-lg font-mono font-bold text-[#E6EDF3] mt-0.5">
            {stats.charsKeptLocal.toLocaleString()} chars
          </div>
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Raw brief + local prompts
          </div>
        </div>

        <div
          className="p-3 rounded bg-[#0A0E17] border border-[#223049]"
          data-testid="stat-median-latency"
        >
          <div className="text-[11px] font-mono text-[#8B9BB4]">
            Median Latency
          </div>
          <div className="text-xs font-mono text-[#E6EDF3] mt-1 flex flex-col gap-0.5">
            <span>
              🔒 Device:{' '}
              <strong>
                {stats.onDeviceCalls > 0
                  ? `${stats.medianOnDeviceLatencyMs} ms`
                  : '—'}
              </strong>
            </span>
            <span>
              ☁️ Cloud:{' '}
              <strong>
                {stats.cloudCalls > 0
                  ? `${stats.medianCloudLatencyMs} ms`
                  : '—'}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
