import {
  applyMap,
  cleanPunctuation,
  gamesStore,
  getAuthUserState,
  hydrateLedgerFromStore,
  listCloudGames,
  saveGameToCloud,
  seal,
  settingsStore,
  setVaultEntries,
  signInWithGoogleWeb,
  subscribeAuthUserState,
  TEMPLATES,
  vault,
  type AuthUserState,
  type GameRecord,
  type PlaceholderEntry,
  type TemplateId,
  type VaultRecord,
} from '@warroom/core';
import { useCallback, useEffect, useState } from 'react';
import { DeviceStatus } from './components/DeviceStatus';
import { EgressInspector } from './components/EgressInspector';
import { BriefScreen } from './screens/Brief';
import { FirewallReviewScreen } from './screens/FirewallReview';
import { HomeScreen } from './screens/Home';
import { ReplayScreen } from './screens/Replay';
import { ReportScreen } from './screens/Report';
import { WarRoomScreen } from './screens/WarRoom';
import { TOKENS } from './tokens';

export interface PlatformInfo {
  kind: 'web' | 'extension';
  authMode: 'anonymous+google' | 'anonymous';
  onDownloadModel?: () => Promise<unknown>;
  initialBrief?: () => Promise<string | null>;
  subscribeInitialBrief?: (onBrief: (text: string) => void) => () => void;
}

export function describePlatform(platform: PlatformInfo): string {
  return `War Room (${platform.kind}, ${platform.authMode})`;
}

export interface AppProps {
  platform: PlatformInfo;
}

export function App({ platform }: AppProps) {
  const [loading, setLoading] = useState(true);
  const [savedGames, setSavedGames] = useState<GameRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<TemplateId | null>(null);
  const [activeGame, setActiveGame] = useState<GameRecord | null>(null);
  const [activeVault, setActiveVault] = useState<VaultRecord | null>(null);
  const [sealingProgress, setSealingProgress] = useState<number | null>(null);
  const [prefilledBrief, setPrefilledBrief] = useState<string | null>(null);
  const [inspectingRoundsFromReport, setInspectingRoundsFromReport] =
    useState<boolean>(false);
  const [egressInspectorOpen, setEgressInspectorOpen] =
    useState<boolean>(false);
  const [authState, setAuthState] = useState<AuthUserState>(() =>
    getAuthUserState(),
  );
  const [cloudSaveBusy, setCloudSaveBusy] = useState<boolean>(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<string | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAuthUserState(setAuthState);
  }, []);

  const applyExternalBriefSelection = useCallback(
    async (selectionText: string) => {
      const trimmed = selectionText.trim();
      if (!trimmed) return;
      await settingsStore.setActiveGameId(null);
      setActiveGame(null);
      setActiveVault(null);
      setPrefilledBrief(trimmed);
      setSelectedTemplateId('startup');
    },
    [],
  );

  const loadPersistedState = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateLedgerFromStore();
      const allGames = await gamesStore.getAll();
      setSavedGames(allGames);

      if (platform.initialBrief) {
        try {
          const fromSelection = await platform.initialBrief();
          if (fromSelection && fromSelection.trim().length > 0) {
            await applyExternalBriefSelection(fromSelection);
            return;
          }
        } catch {
          // Ignore initialBrief error
        }
      }

      const activeId = await settingsStore.getActiveGameId();
      if (activeId) {
        const [game, vaultRec] = await Promise.all([
          gamesStore.get(activeId),
          vault.get(activeId),
        ]);
        if (game && vaultRec) {
          const recoveredGame: GameRecord =
            game.phase.kind === 'sealing_brief'
              ? { ...game, phase: { kind: 'draft' } }
              : game;
          setVaultEntries(vaultRec.map, recoveredGame.id);
          setActiveGame(recoveredGame);
          setActiveVault(vaultRec);
          setSelectedTemplateId(recoveredGame.templateId);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [platform, applyExternalBriefSelection]);

  useEffect(() => {
    void loadPersistedState();
  }, [loadPersistedState]);

  useEffect(() => {
    if (!platform.subscribeInitialBrief) return;
    return platform.subscribeInitialBrief((selectionText) => {
      void applyExternalBriefSelection(selectionText);
    });
  }, [platform, applyExternalBriefSelection]);

  const handleSelectTemplate = async (templateId: TemplateId) => {
    await settingsStore.setActiveGameId(null);
    setActiveGame(null);
    setActiveVault(null);
    setPrefilledBrief(null);
    setSelectedTemplateId(templateId);
  };

  const handleResumeGame = async (gameId: string) => {
    const [game, existingVault] = await Promise.all([
      gamesStore.get(gameId),
      vault.get(gameId),
    ]);
    if (game) {
      const vaultRec: VaultRecord = existingVault ?? {
        gameId: game.id,
        rawObjective: game.objective,
        rawBrief: game.brief,
        rawMoves: {},
        map: [],
      };
      if (!existingVault) {
        await vault.put(vaultRec);
      }
      await settingsStore.setActiveGameId(game.id);
      setVaultEntries(vaultRec.map, game.id);
      setActiveGame(game);
      setActiveVault(vaultRec);
      setSelectedTemplateId(game.templateId);
      setCloudSaveStatus(null);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogleWeb();
    } catch (err) {
      setCloudSaveStatus(
        err instanceof Error ? err.message : 'Google sign-in failed',
      );
    }
  };

  const handleSaveToCloud = async () => {
    if (!activeGame || cloudSaveBusy) return;
    const uid = authState.uid;
    if (!uid) {
      setCloudSaveStatus('No authenticated user UID available.');
      return;
    }

    setCloudSaveBusy(true);
    setCloudSaveStatus('Saving abstracted game to Firestore...');
    try {
      const { updatedGame } = await saveGameToCloud(activeGame, uid);
      setActiveGame(updatedGame);
      setCloudSaveStatus('Saved to cloud (abstracted only)');
    } catch (err) {
      setCloudSaveStatus(
        err instanceof Error ? err.message : 'Cloud save failed',
      );
    } finally {
      setCloudSaveBusy(false);
    }
  };

  const handleSyncCloudGames = async () => {
    if (cloudSyncBusy) return;
    const uid = authState.uid;
    if (!uid) {
      setCloudSyncStatus('Waiting for anonymous or Google auth...');
      return;
    }

    setCloudSyncBusy(true);
    setCloudSyncStatus('Fetching from Firestore...');
    try {
      const cloudGames = await listCloudGames(uid);
      for (const cg of cloudGames) {
        await gamesStore.put(cg);
      }
      const allGames = await gamesStore.getAll();
      setSavedGames(allGames);
      setCloudSyncStatus(
        cloudGames.length > 0
          ? `Loaded ${cloudGames.length} cloud ${cloudGames.length === 1 ? 'game' : 'games'}`
          : 'No cloud games found for this account',
      );
    } catch (err) {
      setCloudSyncStatus(
        err instanceof Error ? err.message : 'Cloud sync failed',
      );
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleResetToHome = async () => {
    await settingsStore.setActiveGameId(null);
    const allGames = await gamesStore.getAll();
    setSavedGames(allGames);
    setActiveGame(null);
    setActiveVault(null);
    setSelectedTemplateId(null);
  };

  const handleSubmitBrief = async (rawObjective: string, rawBrief: string) => {
    if (!selectedTemplateId) return;
    const template = TEMPLATES[selectedTemplateId];
    const gameId = activeGame?.id ?? `wr-${Date.now()}`;
    const existingMap = activeVault?.map ?? [];

    setSealingProgress(0.1);
    try {
      const alwaysRedact = await settingsStore.getAlwaysRedactList();
      const combinedText = `${rawObjective}\n\n${rawBrief}`;
      const sealed = await seal(combinedText, existingMap, {
        customAlwaysRedact: alwaysRedact,
        gameId,
        onProgress: (p) => setSealingProgress(p),
      });

      const abstractedObjective = applyMap(rawObjective, sealed.map);
      const abstractedBrief = applyMap(rawBrief, sealed.map);

      const now = Date.now();
      const newGame: GameRecord = {
        id: gameId,
        schemaVersion: 1,
        templateId: selectedTemplateId,
        objective: abstractedObjective,
        brief: abstractedBrief,
        redactionMethod: sealed.method,
        generals: template.generals,
        crowd: template.crowd,
        totalRounds: 3,
        rounds: [],
        commitments: [],
        report: null,
        phase: { kind: 'review' },
        whatIfs: [],
        createdAt: activeGame?.createdAt ?? now,
        updatedAt: now,
        cloudSavedAt: null,
      };

      const newVault: VaultRecord = {
        gameId,
        rawObjective,
        rawBrief,
        rawMoves: activeVault?.rawMoves ?? {},
        map: sealed.map,
      };

      await Promise.all([
        gamesStore.put(newGame),
        vault.put(newVault),
        settingsStore.setActiveGameId(gameId),
      ]);

      setActiveGame(newGame);
      setActiveVault(newVault);
    } finally {
      setSealingProgress(null);
    }
  };

  const handleUpdateMap = async (
    nextMap: PlaceholderEntry[],
    nextAbstractedObjective: string,
    nextAbstractedBrief: string,
  ) => {
    if (!activeGame || !activeVault) return;

    const updatedGame: GameRecord = {
      ...activeGame,
      objective: nextAbstractedObjective,
      brief: nextAbstractedBrief,
      updatedAt: Date.now(),
    };
    const updatedVault: VaultRecord = {
      ...activeVault,
      map: nextMap,
    };

    setVaultEntries(nextMap, activeGame.id);
    setActiveGame(updatedGame);
    setActiveVault(updatedVault);

    await Promise.all([
      gamesStore.put(updatedGame),
      vault.put(updatedVault),
    ]);
  };

  const handleApproveRedaction = async () => {
    if (!activeGame) return;
    const updatedGame: GameRecord = {
      ...activeGame,
      phase: { kind: 'user_turn', round: 1 },
      updatedAt: Date.now(),
    };
    setActiveGame(updatedGame);
    await gamesStore.put(updatedGame);
  };

  const handleBackToEditBrief = async () => {
    if (!activeGame) return;
    const updatedGame: GameRecord = {
      ...activeGame,
      phase: { kind: 'draft' },
      updatedAt: Date.now(),
    };
    setActiveGame(updatedGame);
    await gamesStore.put(updatedGame);
  };

  return (
    <div className="min-h-screen text-text overflow-x-hidden">
      <header className="border-b border-line bg-surface sticky top-0 z-10">
        <div className="max-w-[1180px] mx-auto px-13 sm:px-21 py-13 flex flex-wrap items-center justify-between gap-13">
          <div className="flex items-center gap-13">
            <button
              type="button"
              onClick={() => void handleResetToHome()}
              className="text-left cursor-pointer"
              data-testid="brand-home-button"
            >
              <span className="font-mono font-semibold text-body tracking-[0.08em] text-text">
                WAR ROOM<span className="wr-cursor">_</span>
              </span>
              <span className="ml-13 terminal-label">
                CONFIDENTIAL AI WAR-GAMING
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            {activeGame &&
              activeGame.phase.kind !== 'draft' &&
              activeGame.phase.kind !== 'sealing_brief' && (
                <div className="flex items-center gap-8">
                  {cloudSaveStatus && (
                    <span
                      className="font-mono text-label text-mint"
                      data-testid="cloud-save-status"
                    >
                      {cleanPunctuation(cloudSaveStatus)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveToCloud()}
                    disabled={cloudSaveBusy}
                    className={TOKENS.classes.btnSecondary}
                    data-testid="btn-save-to-cloud"
                  >
                    {cloudSaveBusy
                      ? 'Saving...'
                      : activeGame.cloudSavedAt
                        ? 'Saved to cloud'
                        : 'Save to cloud'}
                  </button>
                </div>
              )}

            {platform.authMode === 'anonymous+google' && (
              <>
                {!authState.isAnonymous &&
                (authState.email || authState.displayName) ? (
                  <span
                    className="px-8 py-5 rounded-[3px] font-mono text-label border border-line bg-bg text-mint"
                    data-testid="auth-user-badge"
                  >
                    {authState.email ?? authState.displayName}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn()}
                    className={TOKENS.classes.btnSecondary}
                    data-testid="btn-google-signin"
                  >
                    Sign in with Google
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => setEgressInspectorOpen(true)}
              className={TOKENS.classes.btnSecondary}
              data-testid="header-btn-egress-inspector"
            >
              Egress inspector
            </button>
            <DeviceStatus onDownloadModel={platform.onDownloadModel} />
          </div>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-13 sm:px-21 pt-21 sm:pt-55 pb-55">
        {loading ? (
          <div className="font-mono text-label uppercase tracking-[0.12em] text-muted">
            [THINKING
            <span className="wr-thinking-dots" />] LOADING LOCAL VAULT
          </div>
        ) : activeGame && activeVault && activeGame.phase.kind === 'review' ? (
          <FirewallReviewScreen
            game={activeGame}
            vaultRecord={activeVault}
            onUpdateMap={(nextMap, nextObj, nextBrief) =>
              void handleUpdateMap(nextMap, nextObj, nextBrief)
            }
            onApprove={() => void handleApproveRedaction()}
            onBackToEdit={() => void handleBackToEditBrief()}
          />
        ) : activeGame &&
          activeVault &&
          (activeGame.phase.kind === 'reporting' ||
            (activeGame.phase.kind === 'failed' &&
              activeGame.phase.at.kind === 'reporting') ||
            (activeGame.phase.kind === 'done' &&
              !inspectingRoundsFromReport)) ? (
          <ReportScreen
            game={activeGame}
            vaultRecord={activeVault}
            onGameUpdated={(nextGame, nextVault) => {
              setActiveGame(nextGame);
              setActiveVault(nextVault);
            }}
            onBackToWarRoom={() => setInspectingRoundsFromReport(true)}
            onOpenEgressInspector={() => setEgressInspectorOpen(true)}
          />
        ) : activeGame &&
          activeVault &&
          activeGame.phase.kind === 'done' &&
          inspectingRoundsFromReport ? (
          <ReplayScreen
            game={activeGame}
            vaultRecord={activeVault}
            onGameUpdated={(nextGame, nextVault) => {
              setActiveGame(nextGame);
              setActiveVault(nextVault);
            }}
            onViewReport={() => setInspectingRoundsFromReport(false)}
            onOpenEgressInspector={() => setEgressInspectorOpen(true)}
          />
        ) : activeGame &&
          activeVault &&
          activeGame.phase.kind !== 'draft' &&
          activeGame.phase.kind !== 'sealing_brief' &&
          activeGame.phase.kind !== 'review' ? (
          <WarRoomScreen
            game={activeGame}
            vaultRecord={activeVault}
            onGameUpdated={(nextGame, nextVault) => {
              setActiveGame(nextGame);
              setActiveVault(nextVault);
              if (nextGame.phase.kind === 'reporting') {
                setInspectingRoundsFromReport(false);
              }
            }}
            onBackToReview={() => {
              const backToReview: GameRecord = {
                ...activeGame,
                phase: { kind: 'review' },
                updatedAt: Date.now(),
              };
              setActiveGame(backToReview);
              void gamesStore.put(backToReview);
            }}
            onOpenReport={() => setInspectingRoundsFromReport(false)}
            onOpenEgressInspector={() => setEgressInspectorOpen(true)}
          />
        ) : selectedTemplateId ? (
          <BriefScreen
            template={TEMPLATES[selectedTemplateId]}
            initialObjective={activeVault?.rawObjective ?? ''}
            initialBrief={prefilledBrief ?? activeVault?.rawBrief ?? ''}
            sealingProgress={sealingProgress}
            onBack={() => void handleResetToHome()}
            onSubmitBrief={(obj, brf) => void handleSubmitBrief(obj, brf)}
          />
        ) : (
          <HomeScreen
            savedGames={savedGames}
            onSelectTemplate={(id) => void handleSelectTemplate(id)}
            onResumeGame={(id) => void handleResumeGame(id)}
            onSyncCloudGames={() => void handleSyncCloudGames()}
            cloudSyncBusy={cloudSyncBusy}
            cloudSyncStatus={cloudSyncStatus}
          />
        )}
      </main>

      <EgressInspector
        open={egressInspectorOpen}
        onClose={() => setEgressInspectorOpen(false)}
        gameId={activeGame?.id}
        vaultMap={activeVault?.map}
      />
    </div>
  );
}
