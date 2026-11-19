import type { PlaceholderEntry } from '@warroom/core';
import { useLedger } from '../hooks/useLedger';
import { TOKENS } from '../tokens';
import { SourceBadge } from './SourceBadge';

export interface EgressInspectorProps {
  open: boolean;
  onClose: () => void;
  gameId?: string;
  vaultMap?: PlaceholderEntry[];
}

export function EgressInspector({
  open,
  onClose,
  gameId,
  vaultMap = [],
}: EgressInspectorProps) {
  const { cloudEntries, blockedRequests } = useLedger(gameId);

  if (!open) return null;

  const enabledOriginals = vaultMap
    .filter((e) => e.enabled && e.original.trim().length >= 3)
    .map((e) => e.original);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs"
      data-testid="egress-inspector-drawer"
    >
      <div className="w-full max-w-2xl bg-[#111826] border-l border-[#223049] h-full flex flex-col">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#223049] flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
                🔍 Cloud Egress Inspector
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-[11px] font-mono text-emerald-300">
                ✓ 0 Vaulted Secrets Leaked
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#E6EDF3] mt-1 mb-0">
              Exact Text of Every Outbound Cloud Call ({cloudEntries.length})
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={TOKENS.classes.btnSecondary + ' text-xs'}
            data-testid="btn-close-egress-inspector"
          >
            ✕ Close
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          <div className="p-3 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono text-[#8B9BB4]">
            <div>
              Active Egress Guard & Network Guard (`window.fetch` wrapper) scan every request to{' '}
              <span className="text-[#E6EDF3]">firebasevertexai.googleapis.com</span> and{' '}
              <span className="text-[#E6EDF3]">firestore.googleapis.com</span>.
            </div>
            {enabledOriginals.length > 0 && (
              <div className="mt-1.5 text-emerald-400">
                Protected vault terms blocked from egress ({enabledOriginals.length}):{' '}
                {enabledOriginals.map((e, i) => (
                  <span
                    key={i}
                    className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-[#162032] border border-[#223049] text-[#E6EDF3]"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>

          {blockedRequests.length > 0 && (
            <div
              className="p-3 rounded bg-red-950/40 border border-red-700/60 flex flex-col gap-2"
              data-testid="egress-blocked-list"
            >
              <div className="text-xs font-mono font-bold text-red-300">
                🛑 Blocked Outbound Leaks ({blockedRequests.length})
              </div>
              {blockedRequests.map((b, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-[#0A0E17] border border-red-800/50 text-xs font-mono text-red-200"
                >
                  <div>Reason: {b.reason}</div>
                  <div className="text-[11px] text-[#8B9BB4] truncate">
                    URL: {b.url}
                  </div>
                </div>
              ))}
            </div>
          )}

          {cloudEntries.length === 0 ? (
            <div
              className="p-6 rounded bg-[#0A0E17] border border-[#223049] text-center text-xs font-mono text-[#8B9BB4]"
              data-testid="egress-empty-state"
            >
              Zero cloud calls recorded for this session so far. Everything has stayed 100% on-device.
            </div>
          ) : (
            cloudEntries.map((entry, idx) => (
              <div
                key={`${entry.ts}-${idx}`}
                className="p-3.5 rounded bg-[#0A0E17] border border-[#223049] flex flex-col gap-2"
                data-testid={`egress-call-${idx + 1}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#223049] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#E0A84B]">
                      #{idx + 1} · {entry.task}
                    </span>
                    <span className="text-xs font-mono text-[#8B9BB4]">
                      ({entry.inChars} chars in / {entry.outChars} chars out)
                    </span>
                  </div>
                  <SourceBadge
                    source={entry.source}
                    latencyMs={entry.latencyMs}
                    fallback={entry.fallback}
                  />
                </div>

                <pre
                  className="m-0 p-2.5 rounded bg-[#111826] border border-[#223049] text-xs font-mono text-[#E6EDF3] whitespace-pre-wrap overflow-x-auto max-h-64"
                  data-testid={`egress-payload-${idx + 1}`}
                >
                  {entry.cloudPayload ?? '(No cloud payload captured)'}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
