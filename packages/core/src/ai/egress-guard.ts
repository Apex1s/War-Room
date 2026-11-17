import type { PlaceholderEntry } from '../firewall/placeholders';
import { setEgressGuard } from './router';

const vaultByGame = new Map<string, PlaceholderEntry[]>();
let globalVaultEntries: PlaceholderEntry[] = [];

function normalizeText(str: string): string {
  return str.trim().replace(/\s+/g, ' ').toLowerCase();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function setVaultEntries(
  entries: PlaceholderEntry[],
  gameId?: string,
): void {
  if (gameId) {
    vaultByGame.set(gameId, [...entries]);
  }
  globalVaultEntries = [...entries];
}

export function getVaultEntries(gameId?: string): PlaceholderEntry[] {
  if (gameId && vaultByGame.has(gameId)) {
    return vaultByGame.get(gameId) ?? [];
  }
  return globalVaultEntries;
}

export function clearVaultEntries(gameId?: string): void {
  if (gameId) {
    vaultByGame.delete(gameId);
  } else {
    vaultByGame.clear();
    globalVaultEntries = [];
  }
}

/**
 * Scan outgoing text for any enabled vaulted original or alias (normalised, length >= 3).
 * Returns the matched original/alias on a hit, or null when clean.
 */
export function findVaultLeak(
  outgoingText: string,
  gameId?: string,
): string | null {
  if (!outgoingText) return null;

  const entries = getVaultEntries(gameId);
  const allEntries =
    gameId && vaultByGame.has(gameId)
      ? entries
      : [
          ...globalVaultEntries,
          ...[...vaultByGame.values()].flat(),
        ];

  const normalizedHaystack = normalizeText(outgoingText);

  for (const entry of allEntries) {
    if (!entry.enabled) continue;
    const terms = [entry.original, ...entry.aliases];

    for (const rawTerm of terms) {
      const normTerm = normalizeText(rawTerm);
      if (normTerm.length < 3) continue;

      const startsWord = /[a-z0-9]/.test(normTerm[0]);
      const endsWord = /[a-z0-9]/.test(normTerm[normTerm.length - 1]);
      const prefix = startsWord ? '(?:^|[^a-z0-9])' : '';
      const suffix = endsWord ? '(?:$|[^a-z0-9])' : '';
      const pattern = new RegExp(`${prefix}${escapeRegExp(normTerm)}${suffix}`, 'i');

      if (pattern.test(normalizedHaystack)) {
        return rawTerm;
      }
    }
  }

  return null;
}

/**
 * Throws if `outgoingText` contains any enabled vaulted original or alias (length >= 3).
 *
 * TODO(Day 9): Firestore writes in `cloud-sync.ts` do not go through `window.fetch`
 * (the Firestore SDK uses WebChannel / gRPC-Web streams), so `net-guard.ts` cannot
 * inspect them. The Day 9 `saveToCloud` function MUST call `assertClean(JSON.stringify(cloudGame), gameId)`
 * before every Firestore write.
 */
export function assertClean(outgoingText: string, gameId?: string): void {
  const leaked = findVaultLeak(outgoingText, gameId);
  if (leaked !== null) {
    throw new Error(`Egress blocked: outgoing payload contains vaulted term "${leaked}"`);
  }
}

// Register assertClean as the router's default egress guard.
export function enableDefaultEgressGuard(): void {
  setEgressGuard(assertClean);
}

enableDefaultEgressGuard();
