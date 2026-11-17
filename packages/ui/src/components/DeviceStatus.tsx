import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { TOKENS } from '../tokens';

export interface DeviceStatusProps {
  onDownloadModel?: () => Promise<unknown>;
}

export function DeviceStatus({ onDownloadModel }: DeviceStatusProps) {
  const { status, progress, triggerDownload } = useDeviceStatus(onDownloadModel);

  if (status === 'available') {
    return (
      <div className={TOKENS.classes.badge} data-testid="device-status-badge">
        <span className="text-emerald-400">🔒</span>
        <span>Gemini Nano Ready (On-Device)</span>
      </div>
    );
  }

  if (status === 'downloading') {
    const pct = Math.round(progress * 100);
    return (
      <div
        className="flex items-center gap-3 px-3 py-1.5 rounded border border-[#E0A84B]/50 bg-[#162032] text-xs font-mono"
        data-testid="device-status-badge"
      >
        <span className="text-[#E0A84B]">Downloading Gemini Nano… {pct}%</span>
        <progress value={progress} max={1} className="w-24 h-2" />
      </div>
    );
  }

  if (status === 'downloadable') {
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-1 rounded border border-[#223049] bg-[#162032] text-xs font-mono"
        data-testid="device-status-badge"
      >
        <span className="text-[#E0A84B]">●</span>
        <span>Gemini Nano Downloadable</span>
        {onDownloadModel && (
          <button
            type="button"
            onClick={() => void triggerDownload()}
            className="px-2 py-0.5 rounded bg-[#E0A84B] text-[#0A0E17] font-sans font-semibold hover:bg-[#e8b765] cursor-pointer"
          >
            Download model
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={TOKENS.classes.badge}
      title="Chrome Gemini Nano is unavailable on this device; deterministic local redaction is active."
      data-testid="device-status-badge"
    >
      <span className="text-amber-400">🛡️</span>
      <span>Basic redaction (on-device AI unavailable)</span>
    </div>
  );
}
