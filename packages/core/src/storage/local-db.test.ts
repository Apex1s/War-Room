import { beforeEach, describe, expect, it } from 'vitest';
import { startupTemplate } from '../game/templates';
import type { GameRecord, VaultRecord } from '../game/types';
import { gamesStore, ledgerStore, settingsStore, vault } from './local-db';

describe('local-db stores (games, vault, ledger, settings)', () => {
  beforeEach(async () => {
    await gamesStore.clear();
    await vault.clear();
    await ledgerStore.clear();
    await settingsStore.clear();
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
});
