import { useDeviceStatus } from '../hooks/useDeviceStatus';

export interface DeviceStatusProps {
  onDownloadModel?: () => Promise<unknown>;
}

export function DeviceStatus({ onDownloadModel }: DeviceStatusProps) {
  const { status, progress, triggerDownload } = useDeviceStatus(onDownloadModel);

  if (status === 'available') {
    return (
      <div
        className="inline-flex items-center gap-8 px-8 py-5 rounded-[3px] font-mono text-label uppercase border border-mint bg-surface text-mint whitespace-nowrap shrink-0"
        data-testid="device-status-badge"
      >
        <span className="wr-live-dot" aria-hidden="true" />
        <span className="sm:hidden">ON-DEVICE AI READY</span>
        <span className="hidden sm:inline">ON-DEVICE AI READY: GEMINI NANO</span>
      </div>
    );
  }

  if (status === 'downloading') {
    const pct = Math.round(progress * 100);
    return (
      <div
        className="inline-flex items-center gap-8 px-8 py-5 rounded-[3px] font-mono text-label uppercase border border-mint bg-surface text-mint whitespace-nowrap shrink-0"
        data-testid="device-status-badge"
      >
        <span className="wr-live-dot" aria-hidden="true" />
        <span className="sm:hidden">NANO {pct}%</span>
        <span className="hidden sm:inline">DOWNLOADING GEMINI NANO {pct}%</span>
        <progress value={progress} max={1} className="hidden sm:inline-block w-55 h-5" />
      </div>
    );
  }

  if (status === 'downloadable') {
    return (
      <div
        className="inline-flex items-center gap-8 px-8 py-5 rounded-[3px] font-mono text-label uppercase border border-line bg-surface text-text whitespace-nowrap shrink-0"
        data-testid="device-status-badge"
      >
        <span className="sm:hidden">NANO DOWNLOADABLE</span>
        <span className="hidden sm:inline">GEMINI NANO DOWNLOADABLE</span>
        {onDownloadModel && (
          <button
            type="button"
            onClick={() => void triggerDownload()}
            className="px-8 py-3 rounded-[3px] bg-mint text-bg font-mono font-semibold text-label hover:bg-mint/90 cursor-pointer"
          >
            Download model
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-8 px-8 py-5 rounded-[3px] font-mono text-label uppercase border border-orange bg-surface text-orange whitespace-nowrap shrink-0"
      title="Chrome Gemini Nano is unavailable on this device; deterministic local redaction is active."
      data-testid="device-status-badge"
    >
      <span className="sm:hidden">BASIC REDACTION</span>
      <span className="hidden sm:inline">
        BASIC REDACTION: ON-DEVICE AI UNAVAILABLE
      </span>
    </div>
  );
}
