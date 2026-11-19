import {
  applyMapWithSpans,
  isDeviceReadyForOnlyOnDevice,
  parseUrlOverrides,
  runRefereeLiveEffect,
  type AiResult,
  type GameRecord,
  type PlaceholderEntry,
  type RefereeLiveOutput,
  type VaultRecord,
} from '@warroom/core';
import { useEffect, useState } from 'react';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { TOKENS } from '../tokens';
import { SourceBadge } from './SourceBadge';

export interface MoveComposerProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  roundNumber: number;
  moveText: string;
  placeholder?: string;
  onChangeMoveText: (text: string) => void;
  onSubmitMove: () => void;
  onUndoMoveChip?: (roundNumber: number, token: string) => void;
  busy: boolean;
}

export function MoveComposer({
  game,
  vaultRecord,
  roundNumber,
  moveText,
  placeholder = 'Launch as described in the brief.',
  onChangeMoveText,
  onSubmitMove,
  onUndoMoveChip,
  busy,
}: MoveComposerProps) {
  const { status: deviceStatus } = useDeviceStatus();
  const [liveResult, setLiveResult] = useState<AiResult<RefereeLiveOutput> | null>(
    null,
  );
  const [liveLoading, setLiveLoading] = useState(false);

  const overrides = parseUrlOverrides();
  const deviceReady =
    deviceStatus === 'available' &&
    isDeviceReadyForOnlyOnDevice() &&
    !overrides.forceCloud;

  const draftPreview = applyMapWithSpans(moveText, vaultRecord.map);
  const uniqueKnownMasked = new Set(draftPreview.spans.map((s) => s.token)).size;

  // Most recent sealed move's newly masked entities (shown as chips with Undo)
  const latestRoundWithChips = [...game.rounds]
    .reverse()
    .find((r) => (r.newEntries?.length ?? 0) > 0);
  const newChips: PlaceholderEntry[] = latestRoundWithChips?.newEntries ?? [];

  useEffect(() => {
    if (!deviceReady || game.phase.kind !== 'user_turn') {
      setLiveLoading(false);
      return;
    }

    const trimmed = moveText.trim();
    if (trimmed.length < 40) {
      setLiveResult(null);
      setLiveLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLiveLoading(true);
      void runRefereeLiveEffect(game, trimmed, { signal: controller.signal })
        .then((res) => {
          if (!controller.signal.aborted && res) {
            setLiveResult(res);
          }
        })
        .catch(() => {
          // Ignore aborted or transient live-coaching errors
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLiveLoading(false);
          }
        });
    }, 800);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [moveText, deviceReady, game]);

  const isUserTurn = game.phase.kind === 'user_turn';

  return (
    <div
      className={TOKENS.classes.card + ' flex flex-col gap-3'}
      data-testid="move-composer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor="move-composer-input"
          className="text-sm font-semibold text-[#E6EDF3]"
        >
          Round {roundNumber} of {game.totalRounds} — Your Strategic Move
        </label>

        {/* Inline "N items masked" strip */}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-xs font-mono text-emerald-300"
          data-testid="move-masked-strip"
        >
          <span>🔒</span>
          <span>
            {uniqueKnownMasked}{' '}
            {uniqueKnownMasked === 1 ? 'item' : 'items'} masked in draft
          </span>
        </span>
      </div>

      {/* New entities masked chips with Undo */}
      {newChips.length > 0 && latestRoundWithChips && (
        <div
          className="flex flex-wrap items-center gap-2 p-2.5 rounded bg-[#0A0E17] border border-[#223049]"
          data-testid="move-new-chips-bar"
        >
          <span className="text-xs font-mono text-emerald-400">
            {newChips.length} new {newChips.length === 1 ? 'item' : 'items'} masked
            (Round {latestRoundWithChips.n}):
          </span>
          {newChips.map((chip) => (
            <span
              key={chip.token}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#162032] border border-[#223049] text-xs font-mono text-[#E6EDF3]"
              data-testid={`move-chip-${chip.token}`}
            >
              <span className="text-red-300 line-through">{chip.original}</span>
              <span className="text-[#8B9BB4]">→</span>
              <span className="text-emerald-300">{chip.token}</span>
              {onUndoMoveChip && (
                <button
                  type="button"
                  onClick={() =>
                    onUndoMoveChip(latestRoundWithChips.n, chip.token)
                  }
                  className="ml-1 text-[11px] text-[#E0A84B] hover:underline cursor-pointer"
                  data-testid={`btn-undo-chip-${chip.token}`}
                >
                  Undo
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <textarea
        id="move-composer-input"
        rows={3}
        value={moveText}
        onChange={(e) => onChangeMoveText(e.target.value)}
        disabled={busy || !isUserTurn}
        className="w-full rounded bg-[#0A0E17] border border-[#223049] px-3.5 py-2.5 text-sm text-[#E6EDF3] font-mono focus:outline-none focus:border-[#E0A84B] disabled:opacity-60"
        placeholder={placeholder}
        data-testid="move-composer-input"
      />

      {/* Live On-Device Referee Coaching (`referee_live`, ONLY_ON_DEVICE) */}
      {deviceReady ? (
        <div
          className="p-3 rounded bg-[#0A0E17] border border-[#223049] flex flex-col gap-2"
          data-testid="referee-live-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
                🔒 Live Referee Coach (On-Device Only)
              </span>
              {liveLoading && (
                <span className="text-xs font-mono text-[#8B9BB4] animate-pulse">
                  · Analyzing raw draft on Gemini Nano…
                </span>
              )}
            </div>
            {liveResult && (
              <SourceBadge
                source={liveResult.source}
                latencyMs={liveResult.latencyMs}
                fallback={liveResult.fallback}
              />
            )}
          </div>

          {liveResult ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span>
                  Clarity:{' '}
                  <strong className="text-[#E6EDF3]">
                    {liveResult.output.clarity}/5
                  </strong>
                </span>
                <span>
                  Risk:{' '}
                  <strong
                    className={
                      liveResult.output.risk === 'high'
                        ? 'text-red-400 uppercase'
                        : liveResult.output.risk === 'medium'
                          ? 'text-amber-300 uppercase'
                          : 'text-emerald-400 uppercase'
                    }
                  >
                    {liveResult.output.risk}
                  </strong>
                </span>
                {liveResult.output.tip && (
                  <span className="text-[#E6EDF3]">
                    Tip: {liveResult.output.tip}
                  </span>
                )}
              </div>

              {liveResult.output.contradicts && (
                <div
                  className="p-2 rounded bg-red-950/50 border border-red-700/70 text-xs font-mono text-red-200"
                  data-testid="referee-live-contradiction"
                >
                  ⚠️ Draft contradicts your earlier commitment: "
                  {liveResult.output.contradicts}"
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs font-mono text-[#8B9BB4]">
              {moveText.trim().length < 40
                ? 'Type at least 40 characters for live on-device move coaching.'
                : 'Waiting for pause in typing (800 ms debounce)…'}
            </div>
          )}
        </div>
      ) : (
        <div
          className="text-xs font-mono text-[#8B9BB4]"
          data-testid="referee-live-unavailable-note"
        >
          🔒 Live coaching while typing is on-device only and hidden when Gemini
          Nano is unavailable so unredacted drafts never leave your device.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-mono text-[#8B9BB4]">
          {game.phase.kind === 'sealing_move' &&
            '🔒 Sealing move through on-device privacy firewall…'}
          {game.phase.kind === 'generals' &&
            `☁️ 3 Generals responding in parallel (${game.generals.length - game.phase.pending.length}/${game.generals.length} complete)…`}
        </div>

        <button
          type="button"
          onClick={onSubmitMove}
          disabled={busy || !isUserTurn || !moveText.trim()}
          className={TOKENS.classes.btnPrimary}
          data-testid="btn-submit-move"
        >
          {busy
            ? `Running Round ${roundNumber}…`
            : `Seal Move & Launch Round ${roundNumber} →`}
        </button>
      </div>
    </div>
  );
}
