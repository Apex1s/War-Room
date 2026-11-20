import {
  applyMapWithSpans,
  cleanPunctuation,
  formatRoundGeneralsStatus,
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

  const currentRoundRecord = game.rounds.find((r) => r.n === roundNumber);
  const newChips: PlaceholderEntry[] = currentRoundRecord?.newEntries ?? [];

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
        .catch(() => {})
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
      className={TOKENS.classes.card + ' flex flex-col gap-13'}
      data-testid="move-composer"
    >
      <div className="flex flex-wrap items-center justify-between gap-8">
        <label htmlFor="move-composer-input" className="terminal-label">
          ROUND {roundNumber} OF {game.totalRounds}: YOUR STRATEGIC MOVE
        </label>

        <span
          className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] border border-mint bg-bg font-mono text-label uppercase text-mint"
          data-testid="move-masked-strip"
        >
          <span>●</span>
          <span>
            {uniqueKnownMasked}{' '}
            {uniqueKnownMasked === 1 ? 'ITEM' : 'ITEMS'} MASKED IN DRAFT
          </span>
        </span>
      </div>

      {/* New entities masked chips with Undo (current round only) */}
      {newChips.length > 0 && currentRoundRecord && (
        <div
          className="flex flex-wrap items-center gap-8 p-13 rounded-[3px] bg-bg border border-line"
          data-testid="move-new-chips-bar"
        >
          <span className="font-mono text-label uppercase text-mint">
            {newChips.length} NEW{' '}
            {newChips.length === 1 ? 'ITEM' : 'ITEMS'} MASKED (ROUND{' '}
            {currentRoundRecord.n}):
          </span>
          {newChips.map((chip) => (
            <span
              key={chip.token}
              className="inline-flex items-center gap-8 px-8 py-3 rounded-[3px] bg-surface border border-line font-mono text-label text-text"
              data-testid={`move-chip-${chip.token}`}
            >
              <span className="text-muted line-through">{chip.original}</span>
              <span className="text-muted">-&gt;</span>
              <span className="text-mint">{chip.token}</span>
              {onUndoMoveChip && (
                <button
                  type="button"
                  onClick={() =>
                    onUndoMoveChip(currentRoundRecord.n, chip.token)
                  }
                  className="text-label text-text underline cursor-pointer"
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
        className={TOKENS.classes.input + ' font-sans'}
        placeholder={placeholder}
        data-testid="move-composer-input"
      />

      {/* Live On-Device Referee Coaching (`referee_live`, ONLY_ON_DEVICE) */}
      {deviceReady ? (
        <div
          className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-8"
          data-testid="referee-live-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="flex items-center gap-8">
              <span className="terminal-label">
                LIVE REFEREE COACH (ON-DEVICE ONLY)
              </span>
              {liveLoading && (
                <span className="inline-flex items-center gap-5 font-mono text-label uppercase tracking-[0.12em] text-muted">
                  <span className="wr-live-dot" aria-hidden="true" />
                  <span>
                    [THINKING
                    <span className="wr-thinking-dots" />]
                  </span>
                </span>
              )}
            </div>
            {liveResult && (
              <SourceBadge
                source={liveResult.source}
                latencyMs={liveResult.latencyMs}
                fallback={liveResult.fallback}
                model={liveResult.model}
              />
            )}
          </div>

          {liveResult ? (
            <div className="flex flex-col gap-8">
              <div className="flex flex-wrap items-center gap-13 font-mono text-label">
                <span>
                  CLARITY: <strong className="text-text">{liveResult.output.clarity}/5</strong>
                </span>
                <span>
                  RISK:{' '}
                  <strong
                    className={
                      liveResult.output.risk === 'high'
                        ? 'text-orange uppercase'
                        : 'text-text uppercase'
                    }
                  >
                    {liveResult.output.risk}
                  </strong>
                </span>
                {liveResult.output.tip && (
                  <span className="font-sans text-body text-text">
                    {cleanPunctuation(liveResult.output.tip)}
                  </span>
                )}
              </div>

              {liveResult.output.contradicts && (
                <div
                  className="border-l-[3px] border-l-orange pl-13 py-5 text-body text-orange"
                  data-testid="referee-live-contradiction"
                >
                  Draft contradicts your earlier commitment: "
                  {cleanPunctuation(liveResult.output.contradicts)}"
                </div>
              )}
            </div>
          ) : (
            <div className="font-mono text-label text-muted">
              {moveText.trim().length < 40
                ? 'Type at least 40 characters for live on-device move coaching.'
                : 'Waiting for pause in typing (800 ms debounce)...'}
            </div>
          )}
        </div>
      ) : (
        <div
          className="font-mono text-label text-muted"
          data-testid="referee-live-unavailable-note"
        >
          Live coaching while typing is on-device only and hidden when Gemini Nano is unavailable so unredacted drafts never leave your device.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-13">
        <div
          className="font-mono text-label text-muted"
          data-testid="move-composer-status"
        >
          {game.phase.kind === 'sealing_move' && (
            <span className="inline-flex items-center gap-5">
              <span className="wr-live-dot" aria-hidden="true" />
              <span>SEALING MOVE IN LOCAL PRIVACY FIREWALL...</span>
            </span>
          )}
          {game.phase.kind === 'generals' &&
            (() => {
              const phase = game.phase;
              if (phase.kind !== 'generals') return null;
              const roundRec = game.rounds.find((r) => r.n === phase.round);
              return `Generals responding in parallel (${formatRoundGeneralsStatus(
                game,
                roundRec,
              )})`;
            })()}
        </div>

        <button
          type="button"
          onClick={onSubmitMove}
          disabled={busy || !isUserTurn || !moveText.trim()}
          className={TOKENS.classes.btnPrimary}
          data-testid="btn-submit-move"
        >
          {busy
            ? `Running round ${roundNumber}...`
            : `Seal move and launch round ${roundNumber}`}
        </button>
      </div>
    </div>
  );
}
