import {
  computeCrowdSentimentAverage,
  computeGeneralScores,
  formatPlayerVsGeneralScore,
  isDeviceReadyForOnlyOnDevice,
  parseUrlOverrides,
  rehydrate,
  runWhatIfEffect,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { useState } from 'react';
import { AgentCard } from '../components/AgentCard';
import { CrowdWall } from '../components/CrowdWall';
import { RefereePanel } from '../components/RefereePanel';
import { SourceBadge } from '../components/SourceBadge';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { TOKENS } from '../tokens';

export interface ReplayScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onViewReport: () => void;
}

export function ReplayScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onViewReport,
}: ReplayScreenProps) {
  const { status: deviceStatus } = useDeviceStatus();
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [showRehydrated, setShowRehydrated] = useState<boolean>(true);
  const [whatIfDraft, setWhatIfDraft] = useState<string>('');
  const [whatIfBusy, setWhatIfBusy] = useState<boolean>(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const overrides = parseUrlOverrides();
  const canRunOfflineWhatIf =
    deviceStatus === 'available' &&
    isDeviceReadyForOnlyOnDevice() &&
    !overrides.forceCloud;

  const roundRecord =
    game.rounds.find((r) => r.n === selectedRound) ?? game.rounds[0];

  const scores = computeGeneralScores(game.generals, game.rounds);
  const scoreMap = new Map(scores.map((s) => [s.generalId, s.score]));

  const formatText = (text: string) =>
    showRehydrated ? rehydrate(text, vaultRecord.map) : text;

  const handleSelectRound = (rNum: number) => {
    setSelectedRound(rNum);
    setWhatIfError(null);
    const rawOriginal =
      vaultRecord.rawMoves[rNum] ??
      game.rounds.find((r) => r.n === rNum)?.userMove ??
      '';
    setWhatIfDraft(rawOriginal);
  };

  const handlePrefillCurrentRoundMove = () => {
    const rawOriginal =
      vaultRecord.rawMoves[selectedRound] ?? roundRecord?.userMove ?? '';
    setWhatIfDraft(rawOriginal);
  };

  const handleRunWhatIf = async () => {
    if (!whatIfDraft.trim() || whatIfBusy || !roundRecord) return;
    setWhatIfBusy(true);
    setWhatIfError(null);
    try {
      const res = await runWhatIfEffect(
        game,
        vaultRecord,
        selectedRound,
        whatIfDraft.trim(),
        {
          onStateChange: onGameUpdated,
        },
      );
      onGameUpdated(res.game, res.vaultRecord);
    } catch (err) {
      setWhatIfError(
        err instanceof Error ? err.message : 'On-device What-If failed',
      );
    } finally {
      setWhatIfBusy(false);
    }
  };

  const roundWhatIfs = game.whatIfs.filter((w) => w.round === selectedRound);

  return (
    <div className="flex flex-col gap-5" data-testid="screen-replay">
      {/* Replay Header Bar */}
      <div className={TOKENS.classes.card + ' flex flex-col gap-4'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              🔁 Offline-Capable Replay & What-If Simulator
            </span>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mt-1 mb-0">
              Replay Finished War Game & Test Counter-Moves Locally
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRehydrated((prev) => !prev)}
              className="px-3 py-1.5 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B]/60 cursor-pointer"
              data-testid="btn-replay-toggle-rehydration"
            >
              {showRehydrated
                ? '👁️ Real Names (Local Re-hydration)'
                : '🛡️ Abstracted Tokens (Cloud View)'}
            </button>

            <button
              type="button"
              onClick={onViewReport}
              className={TOKENS.classes.btnPrimary + ' text-xs py-1.5'}
              data-testid="btn-replay-to-report"
            >
              ← Back to Final Verdict Report
            </button>
          </div>
        </div>

        {/* Round Selector + Final Scores */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#223049]">
          <div className="flex items-center gap-2">
            {game.rounds.map((r) => (
              <button
                key={r.n}
                type="button"
                onClick={() => handleSelectRound(r.n)}
                className={`px-3 py-1.5 rounded text-xs font-mono border cursor-pointer ${
                  selectedRound === r.n
                    ? 'bg-[#E0A84B]/20 border-[#E0A84B] text-[#E0A84B] font-semibold'
                    : 'bg-[#0A0E17] border-[#223049] text-[#E6EDF3] hover:border-[#E0A84B]/50'
                }`}
                data-testid={`replay-round-tab-${r.n}`}
              >
                Round {r.n}
                {game.whatIfs.some((w) => w.round === r.n)
                  ? ` (${game.whatIfs.filter((w) => w.round === r.n).length} what-if)`
                  : ''}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {scores.map((s) => {
              const gen = game.generals.find((g) => g.id === s.generalId);
              return (
                <span
                  key={s.generalId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: gen?.color ?? '#E0A84B' }}
                  />
                  <span
                    className={
                      s.score > 0
                        ? 'text-emerald-400 font-semibold'
                        : s.score < 0
                          ? 'text-red-400 font-semibold'
                          : 'text-[#E6EDF3]'
                    }
                  >
                    {formatPlayerVsGeneralScore(s.name, s.score)}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Offline What-If Simulator Box */}
      <div
        className={TOKENS.classes.card + ' border-[#E0A84B]/50 flex flex-col gap-3'}
        data-testid="what-if-composer"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
              🔒 Offline What-If Simulator — Round {selectedRound} (ONLY_ON_DEVICE)
            </span>
            <p className="text-xs text-[#8B9BB4] mt-0.5 mb-0">
              Edit your Round {selectedRound} move and re-run the Referee and 5 rotating Crowd personas locally on Gemini Nano. Works with the network off.{' '}
              <strong className="text-[#E6EDF3]">
                Generals&apos; replies are from the original game.
              </strong>
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrefillCurrentRoundMove}
            className={TOKENS.classes.btnSecondary + ' text-xs py-1'}
            data-testid="btn-prefill-what-if"
          >
            Load Original Round {selectedRound} Move
          </button>
        </div>

        <textarea
          rows={3}
          value={whatIfDraft}
          onChange={(e) => setWhatIfDraft(e.target.value)}
          disabled={whatIfBusy || !canRunOfflineWhatIf}
          placeholder={
            canRunOfflineWhatIf
              ? `Type an alternative Round ${selectedRound} move to test offline against the recorded Generals' replies…`
              : 'On-device Gemini Nano is required for offline What-If simulations.'
          }
          className="w-full rounded bg-[#0A0E17] border border-[#223049] px-3.5 py-2.5 text-sm text-[#E6EDF3] font-mono focus:outline-none focus:border-[#E0A84B] disabled:opacity-60"
          data-testid="what-if-input"
        />

        {whatIfError && (
          <div className="text-xs font-mono text-red-400">{whatIfError}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-mono text-[#8B9BB4]">
            {canRunOfflineWhatIf
              ? '🔒 Zero network requests — seals move + runs Referee & Crowd on-device.'
              : '🛡️ Offline What-If is disabled when Gemini Nano is unavailable.'}
          </span>

          <button
            type="button"
            onClick={() => void handleRunWhatIf()}
            disabled={whatIfBusy || !canRunOfflineWhatIf || !whatIfDraft.trim()}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-run-what-if"
          >
            {whatIfBusy
              ? '🔒 Running On-Device What-If…'
              : `Run Offline What-If for Round ${selectedRound} →`}
          </button>
        </div>
      </div>

      {/* Saved What-If Branches for Selected Round */}
      {roundWhatIfs.length > 0 && (
        <div
          className="flex flex-col gap-4"
          data-testid={`what-if-results-r${selectedRound}`}
        >
          {roundWhatIfs.map((wi, idx) => {
            const avgSent = computeCrowdSentimentAverage(wi.crowd);
            return (
              <div
                key={wi.createdAt}
                className={
                  TOKENS.classes.card +
                  ' border-emerald-600/50 flex flex-col gap-3'
                }
                data-testid={`what-if-card-${idx + 1}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#223049] pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-xs font-mono text-emerald-300">
                      🔒 What-If #{idx + 1} (Round {wi.round})
                    </span>
                    <span
                      className="text-xs font-mono text-[#E0A84B]"
                      data-testid="what-if-generals-note"
                    >
                      Generals&apos; replies are from the original game
                    </span>
                  </div>
                  {wi.referee && (
                    <SourceBadge
                      source={wi.referee.source}
                      latencyMs={wi.referee.latencyMs}
                      fallback={wi.referee.fallback}
                    />
                  )}
                </div>

                <div className="text-sm font-mono text-[#E6EDF3]">
                  <span className="text-[#8B9BB4]">Alternative Move:</span>{' '}
                  {formatText(wi.userMove)}
                </div>

                {wi.referee && (
                  <div className="p-3 rounded bg-[#0A0E17] border border-[#223049] flex flex-col gap-2">
                    <div className="text-xs font-mono text-[#E0A84B]">
                      ⚖️ What-If Referee Verdict:
                    </div>
                    <p className="text-xs text-[#E6EDF3] m-0 leading-relaxed">
                      {formatText(wi.referee.summary)}
                    </p>
                    {wi.referee.contradiction && (
                      <div className="text-xs font-mono text-red-300">
                        ⚠️ Contradiction: {formatText(wi.referee.contradiction)}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {wi.referee.scores.map((s) => {
                        const gen = game.generals.find(
                          (g) => g.id === s.generalId,
                        );
                        return (
                          <span
                            key={s.generalId}
                            className="px-2 py-0.5 rounded bg-[#162032] border border-[#223049] text-xs font-mono text-[#E6EDF3]"
                          >
                            {formatPlayerVsGeneralScore(
                              gen?.name ?? s.generalId,
                              s.delta,
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {wi.crowd.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-mono text-[#8B9BB4]">
                      👥 What-If Crowd Reactions (Avg sentiment:{' '}
                      {avgSent !== null && avgSent > 0
                        ? `+${avgSent}`
                        : avgSent}
                      )
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      {wi.crowd.map((rx) => {
                        const persona = game.crowd.find(
                          (p) => p.id === rx.personaId,
                        );
                        return (
                          <div
                            key={rx.personaId}
                            className="p-2.5 rounded bg-[#0A0E17] border border-[#223049] text-xs font-mono flex flex-col justify-between gap-1.5"
                          >
                            <div className="font-sans font-semibold text-[#E6EDF3]">
                              {persona?.label ?? rx.personaId} (
                              {rx.sentiment > 0
                                ? `+${rx.sentiment}`
                                : rx.sentiment}
                              )
                            </div>
                            <div className="text-[#E6EDF3]/90">
                              "{formatText(rx.quote)}"
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Original Recorded Round Details */}
      {roundRecord && (
        <div className="flex flex-col gap-4">
          <div className={TOKENS.classes.card + ' flex flex-col gap-4'}>
            <div className="border-b border-[#223049] pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
                Original Recorded Round {roundRecord.n} of {game.totalRounds}
              </span>
              <div className="text-sm font-mono text-[#E6EDF3] mt-1">
                <span className="text-[#8B9BB4]">Original Move:</span>{' '}
                {formatText(roundRecord.userMove)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {game.generals.map((gen) => {
                const reply = roundRecord.generalMoves.find(
                  (m) => m.generalId === gen.id,
                );
                const scoreDelta = roundRecord.referee?.scores.find(
                  (s) => s.generalId === gen.id,
                )?.delta;
                return (
                  <AgentCard
                    key={gen.id}
                    general={gen}
                    roundNumber={roundRecord.n}
                    reply={reply}
                    scoreDelta={scoreDelta}
                    cumulativeScore={scoreMap.get(gen.id) ?? 0}
                    isPending={false}
                    vaultMap={vaultRecord.map}
                    showRehydrated={showRehydrated}
                    busy={false}
                    onRetryGeneral={() => {}}
                  />
                );
              })}
            </div>
          </div>

          {roundRecord.referee && (
            <RefereePanel
              roundNumber={roundRecord.n}
              referee={roundRecord.referee}
              refereeStatus="done"
              generals={game.generals}
              commitments={game.commitments}
              vaultMap={vaultRecord.map}
              showRehydrated={showRehydrated}
            />
          )}

          {roundRecord.crowd.length > 0 && (
            <CrowdWall
              roundNumber={roundRecord.n}
              allPersonas={game.crowd}
              reactions={roundRecord.crowd}
              crowdStatus="done"
              vaultMap={vaultRecord.map}
              showRehydrated={showRehydrated}
            />
          )}
        </div>
      )}
    </div>
  );
}
