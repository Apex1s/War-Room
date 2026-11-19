import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { assertClean } from '../ai/egress-guard';
import type { GameRecord } from '../game/types';
import { gamesStore } from './local-db';

/**
 * Abstracted game record persisted to Firestore under `users/{uid}/games/{gameId}`.
 * By design (docs/01-technical-design.md §5), this module imports `GameRecord` and
 * NEVER imports `VaultRecord` or the `vault` store.
 */
export type CloudGame = Omit<GameRecord, 'phase' | 'whatIfs'> & {
  ownerUid: string;
};

export const FORBIDDEN_CLOUD_KEYS = [
  'map',
  'rawBrief',
  'rawMoves',
  'rawObjective',
  'vault',
] as const;

export interface CloudSyncAdapter {
  writeGame(uid: string, gameId: string, data: CloudGame): Promise<void>;
  readGame(uid: string, gameId: string): Promise<CloudGame | null>;
  listGames(uid: string): Promise<CloudGame[]>;
  deleteGame(uid: string, gameId: string): Promise<void>;
}

let activeFirestore: Firestore | null = null;
let customAdapter: CloudSyncAdapter | null = null;

export function setCloudSyncFirestore(db: Firestore | null): void {
  activeFirestore = db;
}

export function setCloudSyncAdapterForTest(
  adapter: CloudSyncAdapter | null,
): void {
  customAdapter = adapter;
}

function getAdapter(db?: Firestore | null): CloudSyncAdapter {
  if (customAdapter) return customAdapter;
  const firestore = db ?? activeFirestore;
  if (!firestore) {
    throw new Error('Firestore is not initialized for cloud sync.');
  }

  return {
    async writeGame(uid: string, gameId: string, data: CloudGame): Promise<void> {
      const ref = doc(firestore, 'users', uid, 'games', gameId);
      await setDoc(ref, data);
    },
    async readGame(uid: string, gameId: string): Promise<CloudGame | null> {
      const ref = doc(firestore, 'users', uid, 'games', gameId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return snap.data() as CloudGame;
    },
    async listGames(uid: string): Promise<CloudGame[]> {
      const colRef = collection(firestore, 'users', uid, 'games');
      const snap = await getDocs(colRef);
      const list: CloudGame[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as CloudGame);
      });
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async deleteGame(uid: string, gameId: string): Promise<void> {
      const ref = doc(firestore, 'users', uid, 'games', gameId);
      await deleteDoc(ref);
    },
  };
}

export function assertNoForbiddenCloudKeys(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;
  for (const forbidden of FORBIDDEN_CLOUD_KEYS) {
    if (forbidden in record) {
      throw new Error(
        `Egress blocked: forbidden vault key "${forbidden}" present on cloud game payload`,
      );
    }
  }
}

export function toCloudGame(
  game: GameRecord,
  ownerUid: string,
  now: number = Date.now(),
): CloudGame {
  assertNoForbiddenCloudKeys(game);
  const { phase: _phase, whatIfs: _whatIfs, ...rest } = game;
  const cloudGame: CloudGame = {
    ...rest,
    ownerUid,
    cloudSavedAt: now,
    updatedAt: now,
  };
  assertNoForbiddenCloudKeys(cloudGame);
  return cloudGame;
}

export function fromCloudGame(cloudGame: CloudGame): GameRecord {
  assertNoForbiddenCloudKeys(cloudGame);
  const { ownerUid: _ownerUid, ...rest } = cloudGame;
  const inferredPhase: GameRecord['phase'] =
    rest.report !== null
      ? { kind: 'done' }
      : {
          kind: 'user_turn',
          round: Math.min(rest.totalRounds, rest.rounds.length + 1),
        };

  return {
    ...rest,
    phase: inferredPhase,
    whatIfs: [],
  };
}

/**
 * Opt-in "Save to cloud" (Firestore `users/{uid}/games/{gameId}`).
 *
 * Security rule: Firestore writes do NOT go through `window.fetch` (they use WebChannel),
 * so `net-guard.ts` cannot inspect them. We MUST call `assertClean(JSON.stringify(game), game.id)`
 * and `assertClean(JSON.stringify(cloudGame), game.id)` before every Firestore write.
 */
export async function saveGameToCloud(
  game: GameRecord,
  ownerUid: string,
  db?: Firestore | null,
): Promise<{ cloudGame: CloudGame; updatedGame: GameRecord }> {
  if (!ownerUid) {
    throw new Error('Cannot save to cloud without an authenticated user UID.');
  }

  // Egress guard check on the incoming game AND the serialized CloudGame before any Firestore write
  assertClean(JSON.stringify(game), game.id);
  const now = Date.now();
  const cloudGame = toCloudGame(game, ownerUid, now);
  assertClean(JSON.stringify(cloudGame), game.id);

  const adapter = getAdapter(db);
  await adapter.writeGame(ownerUid, game.id, cloudGame);

  const updatedGame: GameRecord = {
    ...game,
    cloudSavedAt: now,
    updatedAt: now,
  };
  await gamesStore.put(updatedGame);

  return { cloudGame, updatedGame };
}

export async function loadGameFromCloud(
  ownerUid: string,
  gameId: string,
  db?: Firestore | null,
): Promise<GameRecord | null> {
  const adapter = getAdapter(db);
  const cloudGame = await adapter.readGame(ownerUid, gameId);
  if (!cloudGame) return null;
  const game = fromCloudGame(cloudGame);
  await gamesStore.put(game);
  return game;
}

export async function listCloudGames(
  ownerUid: string,
  db?: Firestore | null,
): Promise<GameRecord[]> {
  if (!ownerUid) return [];
  const adapter = getAdapter(db);
  const list = await adapter.listGames(ownerUid);
  return list.map(fromCloudGame);
}

export async function deleteGameFromCloud(
  ownerUid: string,
  gameId: string,
  db?: Firestore | null,
): Promise<void> {
  const adapter = getAdapter(db);
  await adapter.deleteGame(ownerUid, gameId);
}
