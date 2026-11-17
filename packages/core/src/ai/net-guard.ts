import { findVaultLeak } from './egress-guard';
import { AiError } from './router';

export interface NetGuardBlockRecord {
  url: string;
  reason: string;
  ts: number;
}

const GUARDED_HOSTS = [
  'firebasevertexai.googleapis.com',
  'firestore.googleapis.com',
];

const activeSealingTexts = new Set<string>();
const blockedLogs: NetGuardBlockRecord[] = [];
let originalFetch: typeof globalThis.fetch | null = null;

export function registerSealingText(rawText: string): () => void {
  const normalized = rawText.trim();
  if (normalized.length >= 3) {
    activeSealingTexts.add(normalized);
  }
  return () => {
    activeSealingTexts.delete(normalized);
  };
}

export async function withSealingText<T>(
  rawText: string,
  fn: () => Promise<T>,
): Promise<T> {
  const unregister = registerSealingText(rawText);
  try {
    return await fn();
  } finally {
    unregister();
  }
}

export function getNetGuardBlocks(): NetGuardBlockRecord[] {
  return [...blockedLogs];
}

export function clearNetGuardBlocks(): void {
  blockedLogs.length = 0;
}

function isGuardedUrl(urlStr: string): boolean {
  return GUARDED_HOSTS.some((host) => urlStr.includes(host));
}

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function extractBodyString(init?: RequestInit): string | null {
  if (!init?.body) return null;
  if (typeof init.body === 'string') return init.body;
  return null;
}

/**
 * Wraps `globalThis.fetch` once so any request to `firebasevertexai.googleapis.com`
 * or `firestore.googleapis.com` whose body contains a vaulted original or an active
 * raw text being sealed is rejected before leaving the page.
 */
export function installNetGuard(): void {
  if (originalFetch !== null || typeof globalThis.fetch !== 'function') {
    return;
  }

  originalFetch = globalThis.fetch;
  const underlyingFetch = originalFetch;

  globalThis.fetch = async function guardedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = extractRequestUrl(input);

    if (isGuardedUrl(url)) {
      const body = extractBodyString(init);
      if (body) {
        for (const sealing of activeSealingTexts) {
          if (body.toLowerCase().includes(sealing.toLowerCase())) {
            const reason = 'Outbound request contains raw text currently being sealed';
            blockedLogs.push({ url, reason, ts: Date.now() });
            throw new AiError('egress_blocked', 'redact', reason);
          }
        }

        const leaked = findVaultLeak(body);
        if (leaked !== null) {
          const reason = `Outbound request contains vaulted term "${leaked}"`;
          blockedLogs.push({ url, reason, ts: Date.now() });
          throw new AiError('egress_blocked', 'general_move', reason);
        }
      }
    }

    return underlyingFetch.call(globalThis, input, init);
  };
}

export function uninstallNetGuard(): void {
  if (originalFetch !== null) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}
