import {
  cleanPunctuation,
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
import { HybridStats } from '../components/HybridStats';
import { RefereePanel } from '../components/RefereePanel';
import { SourceBadge } from '../components/SourceBadge';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { TOKENS } from '../tokens';

export interface ReplayScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onViewReport: () => void;
  onOpenEgressInspector?: () => void;
}

export function ReplayScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onViewReport,
  onOpenEgressInspector,
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
    showRehydrated ? rehydrate(text, vaultRecord.map) : cleanPunctuation(text);

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
    <div className="flex flex-col gap-21" data-testid="screen-replay">
      {/* Replay Header Bar */}
      <div className={TOKENS.classes.card + ' flex flex-col gap-13'}>
        <div className="flex flex-wrap items-center justify-between gap-13">
          <div>
            <span className="terminal-label">
              OFFLINE REPLAY AND WHAT-IF SIMULATOR
            </span>
            <h2 className="text-title font-semibold text-text mt-5 mb-0">
              Replay finished war game and test counter-moves locally
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            <button
              type="button"
              onClick={() => setShowRehydrated((prev) => !prev)}
              className={TOKENS.classes.btnSecondary}
              data-testid="btn-replay-toggle-rehydration"
            >
              {showRehydrated
                ? 'Real names (local re-hydration)'
                : 'Abstracted tokens (cloud view)'}
            </button>

            <button
              type="button"
              onClick={onViewReport}
              className={TOKENS.classes.btnSecondary}
              data-testid="btn-replay-to-report"
            >
              Back to final verdict report
            </button>
          </div>
        </div>

        {/* Round Selector + Final Scores */}
        <div className="flex flex-wrap items-center justify-between gap-13 pt-13 border-t border-line">
          <div className="flex flex-wrap items-center gap-8">
            {game.rounds.map((r) => (
              <button
                key={r.n}
                type="button"
                onClick={() => handleSelectRound(r.n)}
                className={`px-13 py-5 rounded-[3px] font-mono text-label uppercase tracking-[0.12em] border cursor-pointer ${
                  selectedRound === r.n
                    ? 'border-mint bg-bg text-mint font-semibold'
                    : 'border-line bg-bg text-text hover:border-mint'
                }`}
                data-testid={`replay-round-tab-${r.n}`}
              >
                ROUND {r.n} OF {game.totalRounds}
                {game.whatIfs.some((w) => w.round === r.n)
                  ? ` (${game.whatIfs.filter((w) => w.round === r.n).length} WHAT-IF)`
                  : ''}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-8">
            {scores.map((s) => (
              <span
                key={s.generalId}
                className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
              >
                {formatPlayerVsGeneralScore(s.name, s.score)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Golden-ratio 61.8% / 38.2% split */}
      <div className="wr-split-golden">
        {/* Left Column (61.8%): What-If composer, What-If results, Original Generals */}
        <div className="flex flex-col gap-13 min-w-0">
          <div
            className={TOKENS.classes.card + ' flex flex-col gap-13'}
            data-testid="what-if-composer"
          >
            <div className="flex flex-wrap items-center justify-between gap-8">
              <div>
                <span className="terminal-label">
                  OFFLINE WHAT-IF SIMULATOR: ROUND {selectedRound} (ONLY_ON_DEVICE)
                </span>
                <p className="text-body text-muted mt-5 mb-0">
                  Edit your Round {selectedRound} move and re-run the Referee and 5 rotating Crowd personas locally on Gemini Nano. Works with the network off.{' '}
                  <strong className="text-text">
                    Generals&apos; replies are from the original game.
                  </strong>
                </p>
              </div>

              <button
                type="button"
                onClick={handlePrefillCurrentRoundMove}
                className={TOKENS.classes.btnSecondary}
                data-testid="btn-prefill-what-if"
              >
                Load original round {selectedRound} move
              </button>
            </div>

            <textarea
              rows={3}
              value={whatIfDraft}
              onChange={(e) => setWhatIfDraft(e.target.value)}
              disabled={whatIfBusy || !canRunOfflineWhatIf}
              placeholder={
                canRunOfflineWhatIf
                  ? `Type an alternative Round ${selectedRound} move to test offline against the recorded Generals' replies...`
                  : 'On-device Gemini Nano is required for offline What-If simulations.'
              }
              className={TOKENS.classes.input}
              data-testid="what-if-input"
            />

            {whatIfError && (
              <div className="font-mono text-label text-orange">
                {cleanPunctuation(whatIfError)}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-13">
              <span className="font-mono text-label text-muted">
                {canRunOfflineWhatIf
                  ? 'Zero network requests: seals move and runs Referee and Crowd on-device.'
                  : 'Offline What-If is disabled when Gemini Nano is unavailable.'}
              </span>

              <button
                type="button"
                onClick={() => void handleRunWhatIf()}
                disabled={
                  whatIfBusy || !canRunOfflineWhatIf || !whatIfDraft.trim()
                }
                className={TOKENS.classes.btnPrimary}
                data-testid="btn-run-what-if"
              >
                {whatIfBusy
                  ? 'Running on-device what-if...'
                  : `Run offline what-if for round ${selectedRound}`}
              </button>
            </div>
          </div>

          {roundWhatIfs.length > 0 && (
            <div
              className="flex flex-col gap-13"
              data-testid={`what-if-results-r${selectedRound}`}
            >
              {roundWhatIfs.map((wi, idx) => {
                const avgSent = computeCrowdSentimentAverage(wi.crowd);
                return (
                  <div
                    key={wi.createdAt}
                    className={
                      TOKENS.classes.card +
                      ' border-mint flex flex-col gap-13'
                    }
                    data-testid={`what-if-card-${idx + 1}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-8 border-b border-line pb-8">
                      <div className="flex flex-wrap items-center gap-8">
                        <span className="px-8 py-3 rounded-[3px] border border-mint bg-bg font-mono text-label uppercase text-mint">
                          ● WHAT-IF #{idx + 1} (ROUND {wi.round})
                        </span>
                        <span
                          className="font-mono text-label text-muted"
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
                          model={wi.referee.model}
                        />
                      )}
                    </div>

                    <div className="text-body text-text">
                      <span className="terminal-label mr-8">
                        ALTERNATIVE MOVE:
                      </span>
                      <span>{formatText(wi.userMove)}</span>
                    </div>

                    {wi.referee && (
                      <div className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-8">
                        <div className="terminal-label">
                          WHAT-IF REFEREE VERDICT
                        </div>
                        <p className="text-body text-text m-0">
                          {formatText(wi.referee.summary)}
                        </p>
                        {wi.referee.contradiction && (
                          <div className="border-l-[3px] border-l-orange pl-13 py-5 text-body text-orange">
                            Contradiction: {formatText(wi.referee.contradiction)}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-8">
                          {wi.referee.scores.map((s) => {
                            const gen = game.generals.find(
                              (g) => g.id === s.generalId,
                            );
                            return (
                              <span
                                key={s.generalId}
                                className="px-8 py-3 rounded-[3px] bg-surface border border-line font-mono text-label text-text"
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
                      <div className="flex flex-col gap-8">
                        <div className="terminal-label">
                          WHAT-IF CROWD REACTIONS (AVG SENTIMENT:{' '}
                          {avgSent !== null && avgSent > 0
                            ? `+${avgSent}`
                            : avgSent}
                          )
                        </div>
                        <div className="flex flex-col gap-8">
                          {wi.crowd.map((rx) => {
                            const persona = game.crowd.find(
                              (p) => p.id === rx.personaId,
                            );
                            return (
                              <div
                                key={rx.personaId}
                                className="p-13 rounded-[3px] bg-bg border border-line flex flex-col gap-5"
                              >
                                <div className="font-sans text-label font-semibold text-text">
                                  {persona?.label ?? rx.personaId} (
                                  {rx.sentiment > 0
                                    ? `+${rx.sentiment}`
                                    : rx.sentiment}
                                  )
                                </div>
                                <div className="text-body text-text">
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

          {roundRecord && (
            <div className="flex flex-col gap-13">
              <div className={TOKENS.classes.card + ' flex flex-col gap-8'}>
                <span className="terminal-label">
                  ORIGINAL RECORDED ROUND {roundRecord.n} OF {game.totalRounds}
                </span>
                <div className="text-body text-text">
                  <span className="terminal-label mr-8">ORIGINAL MOVE:</span>
                  <span>{formatText(roundRecord.userMove)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-13">
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
          )}
        </div>

        {/* Right Column (38.2%): Original Referee, Original Crowd, Hybrid Telemetry */}
        <div className="flex flex-col gap-13 min-w-0">
          {roundRecord && (
            <>
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
            </>
          )}

          <HybridStats
            gameId={game.id}
            rawBriefChars={
              vaultRecord.rawObjective.length + vaultRecord.rawBrief.length
            }
            onOpenEgressInspector={onOpenEgressInspector}
          />
        </div>
      </div>
    </div>
  );
}
