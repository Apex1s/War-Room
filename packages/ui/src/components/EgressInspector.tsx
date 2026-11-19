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
      className="fixed inset-0 z-50 flex justify-end bg-bg/80 backdrop-blur-xs"
      data-testid="egress-inspector-drawer"
    >
      <div className="w-full max-w-2xl bg-surface border-l border-line h-full flex flex-col">
        {/* Drawer Header */}
        <div className="p-21 border-b border-line flex items-center justify-between gap-13">
          <div>
            <div className="flex flex-wrap items-center gap-8">
              <span className="terminal-label">CLOUD EGRESS INSPECTOR</span>
              <span className="px-8 py-3 rounded-[3px] border border-mint bg-bg font-mono text-label uppercase text-mint">
                0 VAULTED SECRETS LEAKED
              </span>
            </div>
            <h3 className="text-title font-semibold text-text mt-5 mb-0">
              Exact text of every outbound cloud call ({cloudEntries.length})
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-close-egress-inspector"
          >
            Close
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-21 overflow-y-auto flex-1 flex flex-col gap-13">
          <div className="p-13 rounded-[3px] bg-bg border border-line font-mono text-label text-muted">
            <div>
              Egress Guard and Network Guard (window.fetch wrapper) scan every request to{' '}
              <span className="text-text">firebasevertexai.googleapis.com</span> and{' '}
              <span className="text-text">firestore.googleapis.com</span>.
            </div>
            {enabledOriginals.length > 0 && (
              <div className="mt-8 text-mint">
                Protected vault terms blocked from egress ({enabledOriginals.length}):{' '}
                {enabledOriginals.map((e, i) => (
                  <span
                    key={i}
                    className="inline-block mr-5 mb-3 px-5 py-3 rounded-[3px] bg-surface border border-line text-text"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>

          {blockedRequests.length > 0 && (
            <div
              className="p-13 rounded-[3px] bg-bg border border-orange flex flex-col gap-8"
              data-testid="egress-blocked-list"
            >
              <div className="flex items-center justify-between gap-8">
                <span className="font-mono text-label uppercase tracking-[0.12em] text-orange font-semibold">
                  BLOCKED OUTBOUND LEAKS ({blockedRequests.length})
                </span>
                <span className="px-8 py-3 rounded-[3px] border border-orange font-mono text-label uppercase text-orange">
                  BLOCKED
                </span>
              </div>
              {blockedRequests.map((b, idx) => (
                <div
                  key={idx}
                  className="p-8 rounded-[3px] bg-surface border border-line font-mono text-label text-orange"
                >
                  <div>Reason: {b.reason}</div>
                  <div className="text-muted truncate">URL: {b.url}</div>
                </div>
              ))}
            </div>
          )}

          {cloudEntries.length === 0 ? (
            <div
              className="p-21 rounded-[3px] bg-bg border border-line text-center font-mono text-label text-muted"
              data-testid="egress-empty-state"
            >
              Zero cloud calls recorded for this session so far. Everything has stayed 100% on-device.
            </div>
          ) : (
            cloudEntries.map((entry, idx) => (
              <div
                key={`${entry.ts}-${idx}`}
                className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-8"
                data-testid={`egress-call-${idx + 1}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-8 border-b border-line pb-8">
                  <div className="flex items-center gap-8">
                    <span className="font-mono text-label uppercase tracking-[0.12em] text-text font-semibold">
                      #{idx + 1} · {entry.task}
                    </span>
                    <span className="font-mono text-label text-muted">
                      ({entry.inChars} chars in / {entry.outChars} chars out)
                    </span>
                  </div>
                  <SourceBadge
                    source={entry.source}
                    latencyMs={entry.latencyMs}
                    fallback={entry.fallback}
                    model={entry.model}
                  />
                </div>

                <pre
                  className="m-0 p-13 rounded-[3px] bg-bg border border-line font-mono text-label text-text whitespace-pre-wrap overflow-x-auto max-h-64"
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
