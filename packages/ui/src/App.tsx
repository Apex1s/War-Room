import {
  applyMap,
  gamesStore,
  seal,
  settingsStore,
  setVaultEntries,
  TEMPLATES,
  vault,
  type GameRecord,
  type PlaceholderEntry,
  type TemplateId,
  type VaultRecord,
} from '@warroom/core';
import { useCallback, useEffect, useState } from 'react';
import { DeviceStatus } from './components/DeviceStatus';
import { BriefScreen } from './screens/Brief';
import { FirewallReviewScreen } from './screens/FirewallReview';
import { HomeScreen } from './screens/Home';
import { WarRoomDebugScreen } from './screens/WarRoomDebug';

export interface PlatformInfo {
  kind: 'web' | 'extension';
  authMode: 'anonymous+google' | 'anonymous';
  onDownloadModel?: () => Promise<unknown>;
  initialBrief?: () => Promise<string | null>;
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

  const loadPersistedState = useCallback(async () => {
    setLoading(true);
    try {
      const allGames = await gamesStore.getAll();
      setSavedGames(allGames);

      const activeId = await settingsStore.getActiveGameId();
      if (activeId) {
        const [game, vaultRec] = await Promise.all([
          gamesStore.get(activeId),
          vault.get(activeId),
        ]);
        if (game && vaultRec) {
          setVaultEntries(vaultRec.map, game.id);
          setActiveGame(game);
          setActiveVault(vaultRec);
          setSelectedTemplateId(game.templateId);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPersistedState();
  }, [loadPersistedState]);

  const handleSelectTemplate = async (templateId: TemplateId) => {
    await settingsStore.setActiveGameId(null);
    setActiveGame(null);
    setActiveVault(null);
    setSelectedTemplateId(templateId);
  };

  const handleResumeGame = async (gameId: string) => {
    const [game, vaultRec] = await Promise.all([
      gamesStore.get(gameId),
      vault.get(gameId),
    ]);
    if (game && vaultRec) {
      await settingsStore.setActiveGameId(game.id);
      setVaultEntries(vaultRec.map, game.id);
      setActiveGame(game);
      setActiveVault(vaultRec);
      setSelectedTemplateId(game.templateId);
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
    <div className="min-h-screen bg-[#0A0E17] text-[#E6EDF3]">
      <header className="border-b border-[#223049] bg-[#111826]/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
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

          <DeviceStatus onDownloadModel={platform.onDownloadModel} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
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
          activeGame.phase.kind !== 'draft' &&
          activeGame.phase.kind !== 'sealing_brief' &&
          activeGame.phase.kind !== 'review' ? (
          <WarRoomDebugScreen
            game={activeGame}
            vaultRecord={activeVault}
            onGameUpdated={(nextGame, nextVault) => {
              setActiveGame(nextGame);
              setActiveVault(nextVault);
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
          />
        ) : selectedTemplateId ? (
          <BriefScreen
            template={TEMPLATES[selectedTemplateId]}
            initialObjective={activeVault?.rawObjective ?? ''}
            initialBrief={activeVault?.rawBrief ?? ''}
            sealingProgress={sealingProgress}
            onBack={() => void handleResetToHome()}
            onSubmitBrief={(obj, brf) => void handleSubmitBrief(obj, brf)}
          />
        ) : (
          <HomeScreen
            savedGames={savedGames}
            onSelectTemplate={(id) => void handleSelectTemplate(id)}
            onResumeGame={(id) => void handleResumeGame(id)}
          />
        )}
      </main>
    </div>
  );
}
