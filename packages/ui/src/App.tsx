import {
  applyMap,
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
import { HybridStats } from './components/HybridStats';
import { BriefScreen } from './screens/Brief';
import { FirewallReviewScreen } from './screens/FirewallReview';
import { HomeScreen } from './screens/Home';
import { ReplayScreen } from './screens/Replay';
import { ReportScreen } from './screens/Report';
import { WarRoomScreen } from './screens/WarRoom';

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId | null>(null);
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

  const applyExternalBriefSelection = useCallback(async (selectionText: string) => {
    const trimmed = selectionText.trim();
    if (!trimmed) return;
    await settingsStore.setActiveGameId(null);
    setActiveGame(null);
    setActiveVault(null);
    setPrefilledBrief(trimmed);
    setSelectedTemplateId('startup');
  }, []);

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
      // If a game was loaded from Firestore on another browser, its local vault does not exist
      // because secrets never leave the original device. Create an empty local vault record so
      // the user can inspect and replay the abstracted game on the second browser.
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
    setCloudSaveStatus('Saving abstracted game to Firestore…');
    try {
      const { updatedGame } = await saveGameToCloud(activeGame, uid);
      setActiveGame(updatedGame);
      setCloudSaveStatus('✓ Saved to cloud (abstracted only)');
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
      setCloudSyncStatus('Waiting for anonymous/Google auth…');
      return;
    }

    setCloudSyncBusy(true);
    setCloudSyncStatus('Fetching from Firestore…');
    try {
      const cloudGames = await listCloudGames(uid);
      for (const cg of cloudGames) {
        await gamesStore.put(cg);
      }
      const allGames = await gamesStore.getAll();
      setSavedGames(allGames);
      setCloudSyncStatus(
        cloudGames.length > 0
          ? `✓ Loaded ${cloudGames.length} cloud ${cloudGames.length === 1 ? 'game' : 'games'}`
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
    <div className="min-h-screen bg-[#0A0E17] text-[#E6EDF3] overflow-x-hidden">
      <header className="border-b border-[#223049] bg-[#111826]/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleResetToHome()}
              className="text-left cursor-pointer"
              data-testid="brand-home-button"
            >
              <span className="text-base font-bold tracking-tight text-[#E6EDF3]">
                WAR ROOM
              </span>
              <span className="ml-2 text-xs font-mono text-[#E0A84B]">
                CONFIDENTIAL AI WAR-GAMING
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeGame &&
              activeGame.phase.kind !== 'draft' &&
              activeGame.phase.kind !== 'sealing_brief' && (
                <div className="flex items-center gap-2">
                  {cloudSaveStatus && (
                    <span
                      className="text-xs font-mono text-emerald-300"
                      data-testid="cloud-save-status"
                    >
                      {cloudSaveStatus}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveToCloud()}
                    disabled={cloudSaveBusy}
                    className="px-2.5 py-1 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B]/60 cursor-pointer disabled:opacity-50"
                    data-testid="btn-save-to-cloud"
                  >
                    {cloudSaveBusy
                      ? '☁️ Saving…'
                      : activeGame.cloudSavedAt
                        ? '☁️ Saved to cloud'
                        : '☁️ Save to cloud'}
                  </button>
                </div>
              )}

            {platform.authMode === 'anonymous+google' && (
              <>
                {!authState.isAnonymous &&
                (authState.email || authState.displayName) ? (
                  <span
                    className="px-2.5 py-1 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-emerald-300"
                    data-testid="auth-user-badge"
                  >
                    👤 {authState.email ?? authState.displayName}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn()}
                    className="px-2.5 py-1 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B]/60 cursor-pointer"
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
              className="px-2.5 py-1 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3] hover:border-[#E0A84B]/60 cursor-pointer"
              data-testid="header-btn-egress-inspector"
            >
              🔍 Egress Inspector
            </button>
            <DeviceStatus onDownloadModel={platform.onDownloadModel} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {loading ? (
          <div className="text-sm font-mono text-[#8B9BB4]">
            Loading local vault…
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
            (activeGame.phase.kind === 'done' && !inspectingRoundsFromReport)) ? (
          <ReportScreen
            game={activeGame}
            vaultRecord={activeVault}
            onGameUpdated={(nextGame, nextVault) => {
              setActiveGame(nextGame);
              setActiveVault(nextVault);
            }}
            onBackToWarRoom={() => setInspectingRoundsFromReport(true)}
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

        {activeGame &&
          activeVault &&
          activeGame.phase.kind !== 'draft' &&
          activeGame.phase.kind !== 'sealing_brief' && (
            <div className="mt-6">
              <HybridStats
                gameId={activeGame.id}
                rawBriefChars={
                  activeVault.rawObjective.length + activeVault.rawBrief.length
                }
                onOpenEgressInspector={() => setEgressInspectorOpen(true)}
              />
            </div>
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
