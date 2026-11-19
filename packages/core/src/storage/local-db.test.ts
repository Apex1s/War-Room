import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVaultEntries, setVaultEntries } from '../ai/egress-guard';
import { startupTemplate } from '../game/templates';
import type { GameRecord, VaultRecord } from '../game/types';
import {
  listCloudGames,
  loadGameFromCloud,
  saveGameToCloud,
  setCloudSyncAdapterForTest,
  type CloudGame,
} from './cloud-sync';
import { gamesStore, ledgerStore, settingsStore, vault } from './local-db';

describe('local-db stores (games, vault, ledger, settings)', () => {
  beforeEach(async () => {
    await gamesStore.clear();
    await vault.clear();
    await ledgerStore.clear();
    await settingsStore.clear();
    clearVaultEntries();
    setCloudSyncAdapterForTest(null);
  });

  afterEach(() => {
    clearVaultEntries();
    setCloudSyncAdapterForTest(null);
  });

  it('persists and retrieves abstracted GameRecord and separate VaultRecord', async () => {
    const game: GameRecord = {
      id: 'game-101',
      schemaVersion: 1,
      templateId: 'startup',
      objective: 'Reach [NUMBER_1] teams for [COMPANY_1]',
      brief: '[COMPANY_1] builds [PRODUCT_1] in [PLACE_1].',
      redactionMethod: 'basic',
      generals: startupTemplate.generals,
      crowd: startupTemplate.crowd,
      totalRounds: 3,
      rounds: [],
      commitments: [],
      report: null,
      phase: { kind: 'review' },
      whatIfs: [],
      createdAt: 1000,
      updatedAt: 2000,
      cloudSavedAt: null,
    };

    const vaultRecord: VaultRecord = {
      gameId: 'game-101',
      rawObjective: 'Reach 1,000 teams for Kestrel Labs',
      rawBrief: 'Kestrel Labs builds PulseAudit in Casablanca.',
      rawMoves: {},
      map: [
        {
          token: '[COMPANY_1]',
          type: 'COMPANY',
          original: 'Kestrel Labs',
          aliases: [],
          detectedBy: 'regex',
          enabled: true,
        },
      ],
    };

    await gamesStore.put(game);
    await vault.put(vaultRecord);
    await settingsStore.setActiveGameId('game-101');

    const loadedGame = await gamesStore.get('game-101');
    const loadedVault = await vault.get('game-101');
    const activeId = await settingsStore.getActiveGameId();

    expect(loadedGame).toEqual(game);
    expect(loadedVault).toEqual(vaultRecord);
    expect(activeId).toBe('game-101');
  });

  it('stores and filters ledger entries by gameId and persists always-redact settings', async () => {
    await ledgerStore.append({
      gameId: 'g1',
      task: 'crowd',
      source: 'on-device',
      model: 'gemini-nano',
      latencyMs: 320,
      inChars: 400,
      outChars: 120,
      fallback: false,
      repaired: false,
      ts: 12345,
    });
    await ledgerStore.append({
      gameId: 'g2',
      task: 'general_move',
      source: 'cloud',
      model: 'gemini-3.5-flash-lite',
      latencyMs: 2100,
      inChars: 900,
      outChars: 350,
      fallback: false,
      repaired: false,
      ts: 12346,
    });

    const g1Calls = await ledgerStore.getByGame('g1');
    expect(g1Calls).toHaveLength(1);
    expect(g1Calls[0].task).toBe('crowd');

    await settingsStore.setAlwaysRedactList(['Project Falcon', 'Amine Tazi']);
    expect(await settingsStore.getAlwaysRedactList()).toEqual([
      'Project Falcon',
      'Amine Tazi',
    ]);
  });

  it('enforces the compiler/module boundary: cloud-sync.ts never imports vault or VaultRecord', () => {
    const cloudSyncSource = fs.readFileSync(
      path.resolve(import.meta.dirname, 'cloud-sync.ts'),
      'utf8',
    );
    expect(cloudSyncSource).not.toMatch(/\bVaultRecord\b/);
    expect(cloudSyncSource).not.toMatch(/import\s*\{[^}]*\bvault\b[^}]*\}\s*from/);

    const firestoreRules = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../../firestore.rules'),
      'utf8',
    );
    expect(firestoreRules).toContain(
      "!request.resource.data.keys().hasAny(['map', 'rawBrief', 'rawMoves', 'rawObjective', 'vault'])",
    );
  });

  it('blocks Firestore writes via assertClean when a planted vault leak or forbidden key is present', async () => {
    const writtenDocs: { uid: string; gameId: string; data: CloudGame }[] = [];
    const cloudMem = new Map<string, CloudGame>();

    setCloudSyncAdapterForTest({
      async writeGame(uid, gameId, data) {
        writtenDocs.push({ uid, gameId, data });
        cloudMem.set(`${uid}/${gameId}`, data);
      },
      async readGame(uid, gameId) {
        return cloudMem.get(`${uid}/${gameId}`) ?? null;
      },
      async listGames(uid) {
        return [...cloudMem.entries()]
          .filter(([k]) => k.startsWith(`${uid}/`))
          .map(([, v]) => v);
      },
      async deleteGame(uid, gameId) {
        cloudMem.delete(`${uid}/${gameId}`);
      },
    });

    setVaultEntries(
      [
        {
          token: '[COMPANY_1]',
          type: 'COMPANY',
          original: 'Kestrel Labs',
          aliases: ['Kestrel'],
          detectedBy: 'ai',
          enabled: true,
        },
        {
          token: '[MONEY_1]',
          type: 'MONEY',
          original: '$240,000',
          aliases: [],
          detectedBy: 'regex',
          enabled: true,
        },
      ],
      'game-cloud-1',
    );

    const cleanGame: GameRecord = {
      id: 'game-cloud-1',
      schemaVersion: 1,
      templateId: 'startup',
      objective: 'Reach 1,000 teams for [COMPANY_1]',
      brief: '[COMPANY_1] has [MONEY_1] ARR.',
      redactionMethod: 'on-device-ai',
      generals: startupTemplate.generals,
      crowd: startupTemplate.crowd,
      totalRounds: 3,
      rounds: [],
      commitments: [],
      report: null,
      phase: { kind: 'done' },
      whatIfs: [],
      createdAt: 1000,
      updatedAt: 2000,
      cloudSavedAt: null,
    };

    // 1. Planted leak in game.brief -> assertClean blocks before adapter.writeGame is called
    const leakyGame: GameRecord = {
      ...cleanGame,
      brief: '[COMPANY_1] (Kestrel Labs) has [MONEY_1] ARR.',
    };

    await expect(saveGameToCloud(leakyGame, 'user-uid-1')).rejects.toThrow(
      /Egress blocked: outgoing payload contains vaulted term "Kestrel Labs"/,
    );
    expect(writtenDocs).toHaveLength(0);

    // 2. Planted forbidden key (e.g. rawBrief) -> blocked before write
    const forbiddenKeyGame = {
      ...cleanGame,
      rawBrief: 'abstracted text without vault words',
    } as unknown as GameRecord;

    await expect(
      saveGameToCloud(forbiddenKeyGame, 'user-uid-1'),
    ).rejects.toThrow(/forbidden vault key "rawBrief"/);
    expect(writtenDocs).toHaveLength(0);

    // 3. Clean abstracted game -> succeeds, strips phase & whatIfs, and round-trips cleanly
    const saved = await saveGameToCloud(cleanGame, 'user-uid-1');
    expect(writtenDocs).toHaveLength(1);
    expect(saved.cloudGame.ownerUid).toBe('user-uid-1');
    expect('phase' in saved.cloudGame).toBe(false);
    expect('whatIfs' in saved.cloudGame).toBe(false);

    const loaded = await loadGameFromCloud('user-uid-1', 'game-cloud-1');
    expect(loaded?.id).toBe('game-cloud-1');
    expect(loaded?.objective).toBe('Reach 1,000 teams for [COMPANY_1]');
    expect(loaded?.cloudSavedAt).toBeTypeOf('number');

    const listed = await listCloudGames('user-uid-1');
    expect(listed).toHaveLength(1);
  });
});
