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

function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\r\n/g, '\n');
}

export function registerSealingText(rawText: string): () => void {
  const normalized = normalizeWhitespace(rawText);
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

function collectDecodedStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) {
      collectDecodedStrings(item, out);
    }
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out.push(key);
      collectDecodedStrings(value, out);
    }
  }
  return out;
}

function blockRequest(url: string, task: 'redact' | 'general_move', reason: string): never {
  blockedLogs.push({ url, reason, ts: Date.now() });
  throw new AiError('egress_blocked', task, reason);
}

async function resolveGuardedBodyString(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body !== 'string') {
      blockRequest(
        url,
        'general_move',
        'Non-string request body to guarded host is blocked (fail closed)',
      );
    }
    return init.body;
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    if (input.body !== null) {
      const contentType = (input.headers.get('content-type') ?? '').toLowerCase();
      if (
        contentType &&
        !contentType.includes('application/json') &&
        !contentType.includes('text/plain')
      ) {
        blockRequest(
          url,
          'general_move',
          `Non-JSON Request content-type "${contentType}" to guarded host is blocked`,
        );
      }
      try {
        return await input.clone().text();
      } catch {
        blockRequest(
          url,
          'general_move',
          'Unreadable Request body to guarded host is blocked (fail closed)',
        );
      }
    }
  }

  return null;
}

function inspectDecodedBody(url: string, rawBody: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    blockRequest(
      url,
      'general_move',
      'Non-JSON request body to guarded host is blocked (fail closed)',
    );
  }

  const decodedStrings = collectDecodedStrings(parsed);
  const combinedDecoded = decodedStrings
    .map((s) => normalizeWhitespace(s))
    .join('\n');
  const combinedLower = combinedDecoded.toLowerCase();

  for (const sealing of activeSealingTexts) {
    if (combinedLower.includes(sealing.toLowerCase())) {
      blockRequest(
        url,
        'redact',
        'Outbound request contains raw text currently being sealed',
      );
    }
  }

  for (const decoded of decodedStrings) {
    const leaked = findVaultLeak(decoded);
    if (leaked !== null) {
      blockRequest(
        url,
        'general_move',
        `Outbound request contains vaulted term "${leaked}"`,
      );
    }
  }
}

/**
 * Wraps `globalThis.fetch` once so any request to `firebasevertexai.googleapis.com`
 * or `firestore.googleapis.com` whose decoded JSON string values contain a vaulted
 * original or an active raw text being sealed is rejected before leaving the page.
 * Fails closed on non-string or non-JSON bodies.
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
      const bodyStr = await resolveGuardedBodyString(url, input, init);
      if (bodyStr !== null) {
        inspectDecodedBody(url, bodyStr);
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
