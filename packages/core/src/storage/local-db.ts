import type { AiCallRecord } from '../ai/ledger';
import type { GameRecord, VaultRecord } from '../game/types';

const DB_NAME = 'warroom';
const DB_VERSION = 1;

interface MemoryFallback {
  games: Map<string, GameRecord>;
  vault: Map<string, VaultRecord>;
  ledger: (AiCallRecord & { id: number })[];
  settings: Map<string, unknown>;
  nextLedgerId: number;
}

const mem: MemoryFallback = {
  games: new Map(),
  vault: new Map(),
  ledger: [],
  settings: new Map(),
  nextLedgerId: 1,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  return typeof globalThis.indexedDB !== 'undefined';
}

function openWarRoomDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('games')) {
        db.createObjectStore('games', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vault')) {
        db.createObjectStore('vault', { keyPath: 'gameId' });
      }
      if (!db.objectStoreNames.contains('ledger')) {
        const ledgerObjStore = db.createObjectStore('ledger', {
          keyPath: 'id',
          autoIncrement: true,
        });
        ledgerObjStore.createIndex('gameId', 'gameId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

/**
 * `games` store: holds abstracted `GameRecord` entries only.
 */
export const gamesStore = {
  async get(id: string): Promise<GameRecord | undefined> {
    if (!hasIndexedDB()) {
      const found = mem.games.get(id);
      return found ? clone(found) : undefined;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('games', 'readonly');
    return reqToPromise<GameRecord | undefined>(tx.objectStore('games').get(id));
  },

  async getAll(): Promise<GameRecord[]> {
    if (!hasIndexedDB()) {
      return [...mem.games.values()]
        .map(clone)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('games', 'readonly');
    const all = await reqToPromise<GameRecord[]>(tx.objectStore('games').getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async put(record: GameRecord): Promise<void> {
    if (!hasIndexedDB()) {
      mem.games.set(record.id, clone(record));
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(record);
    await txDone(tx);
  },

  async delete(id: string): Promise<void> {
    if (!hasIndexedDB()) {
      mem.games.delete(id);
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').delete(id);
    await txDone(tx);
  },

  async clear(): Promise<void> {
    if (!hasIndexedDB()) {
      mem.games.clear();
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').clear();
    await txDone(tx);
  },
};

/**
 * `vault` store: holds raw confidential text and placeholder maps.
 * Exposed as a separate `vault` object that `cloud-sync.ts` must never import.
 */
export const vault = {
  async get(gameId: string): Promise<VaultRecord | undefined> {
    if (!hasIndexedDB()) {
      const found = mem.vault.get(gameId);
      return found ? clone(found) : undefined;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('vault', 'readonly');
    return reqToPromise<VaultRecord | undefined>(tx.objectStore('vault').get(gameId));
  },

  async put(record: VaultRecord): Promise<void> {
    if (!hasIndexedDB()) {
      mem.vault.set(record.gameId, clone(record));
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('vault', 'readwrite');
    tx.objectStore('vault').put(record);
    await txDone(tx);
  },

  async delete(gameId: string): Promise<void> {
    if (!hasIndexedDB()) {
      mem.vault.delete(gameId);
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('vault', 'readwrite');
    tx.objectStore('vault').delete(gameId);
    await txDone(tx);
  },

  async clear(): Promise<void> {
    if (!hasIndexedDB()) {
      mem.vault.clear();
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('vault', 'readwrite');
    tx.objectStore('vault').clear();
    await txDone(tx);
  },
};

/**
 * `ledger` store: persists `AiCallRecord` entries per AI call.
 */
export const ledgerStore = {
  async append(record: AiCallRecord): Promise<number> {
    if (!hasIndexedDB()) {
      const id = mem.nextLedgerId++;
      mem.ledger.push({ ...clone(record), id });
      return id;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('ledger', 'readwrite');
    const key = await reqToPromise<IDBValidKey>(tx.objectStore('ledger').add(record));
    await txDone(tx);
    return Number(key);
  },

  async getByGame(gameId: string): Promise<AiCallRecord[]> {
    if (!hasIndexedDB()) {
      return mem.ledger.filter((r) => r.gameId === gameId).map(clone);
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('ledger', 'readonly');
    const index = tx.objectStore('ledger').index('gameId');
    return reqToPromise<AiCallRecord[]>(index.getAll(gameId));
  },

  async getAll(): Promise<AiCallRecord[]> {
    if (!hasIndexedDB()) {
      return mem.ledger.map(clone);
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('ledger', 'readonly');
    return reqToPromise<AiCallRecord[]>(tx.objectStore('ledger').getAll());
  },

  async clear(): Promise<void> {
    if (!hasIndexedDB()) {
      mem.ledger.length = 0;
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('ledger', 'readwrite');
    tx.objectStore('ledger').clear();
    await txDone(tx);
  },
};

const ALWAYS_REDACT_KEY = 'alwaysRedactList';
const ACTIVE_GAME_ID_KEY = 'activeGameId';
const ROUTING_TABLE_JSON_KEY = 'lastGoodRoutingTableJson';

/**
 * `settings` store: holds user preferences, always-redact list, and active game ID.
 */
export const settingsStore = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    if (!hasIndexedDB()) {
      const val = mem.settings.get(key);
      return val !== undefined ? clone(val as T) : undefined;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('settings', 'readonly');
    return reqToPromise<T | undefined>(tx.objectStore('settings').get(key));
  },

  async set<T = unknown>(key: string, value: T): Promise<void> {
    if (!hasIndexedDB()) {
      mem.settings.set(key, clone(value));
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, key);
    await txDone(tx);
  },

  async getAlwaysRedactList(): Promise<string[]> {
    return (await settingsStore.get<string[]>(ALWAYS_REDACT_KEY)) ?? [];
  },

  async setAlwaysRedactList(list: string[]): Promise<void> {
    await settingsStore.set(ALWAYS_REDACT_KEY, list);
  },

  async getActiveGameId(): Promise<string | null> {
    return (await settingsStore.get<string | null>(ACTIVE_GAME_ID_KEY)) ?? null;
  },

  async setActiveGameId(gameId: string | null): Promise<void> {
    await settingsStore.set(ACTIVE_GAME_ID_KEY, gameId);
  },

  async getLastGoodRoutingTableJson(): Promise<string | null> {
    return (await settingsStore.get<string | null>(ROUTING_TABLE_JSON_KEY)) ?? null;
  },

  async setLastGoodRoutingTableJson(json: string): Promise<void> {
    await settingsStore.set(ROUTING_TABLE_JSON_KEY, json);
  },

  async clear(): Promise<void> {
    if (!hasIndexedDB()) {
      mem.settings.clear();
      return;
    }
    const db = await openWarRoomDB();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').clear();
    await txDone(tx);
  },
};
