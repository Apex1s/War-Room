import type { DetectedEntity, EntityType } from './detectors';

export interface PlaceholderEntry {
  token: string;
  type: EntityType;
  original: string;
  aliases: string[];
  detectedBy: 'ai' | 'regex' | 'user';
  enabled: boolean;
  hint?: string;
}

export interface TextSpan {
  start: number;
  end: number;
  original: string;
  token: string;
  type: EntityType;
}

export interface InventedTokenLog {
  token: string;
  replacement: string;
  ts: number;
}

const NAME_TYPES = new Set<EntityType>([
  'COMPANY',
  'PERSON',
  'PRODUCT',
  'PLACE',
  'OTHER',
]);

const NEUTRAL_PHRASES: Record<EntityType, string> = {
  COMPANY: 'a company',
  PERSON: 'a person',
  PRODUCT: 'a product',
  PLACE: 'a place',
  OTHER: 'an entity',
  MONEY: 'an amount',
  PERCENT: 'a percentage',
  NUMBER: 'a number',
  DATE: 'a date',
  CONTACT: 'a contact',
};

const inventedTokenLogs: InventedTokenLog[] = [];

export function getInventedTokenLogs(): InventedTokenLog[] {
  return [...inventedTokenLogs];
}

export function clearInventedTokenLogs(): void {
  inventedTokenLogs.length = 0;
}

export function isNameEntityType(type: EntityType): boolean {
  return NAME_TYPES.has(type);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeToken(token: string): string {
  const trimmed = token.trim().toUpperCase();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed;
  }
  return `[${trimmed}]`;
}

function parseTokenIndex(token: string): { type: EntityType; index: number } | null {
  const m = /^\[?(COMPANY|PERSON|PRODUCT|PLACE|OTHER|MONEY|PERCENT|NUMBER|DATE|CONTACT)_(\d+)\]?$/.exec(
    token.trim(),
  );
  if (!m) return null;
  return { type: m[1] as EntityType, index: Number(m[2]) };
}

function deriveAliases(original: string, type: EntityType): string[] {
  if (!isNameEntityType(type)) return [];
  const aliases = new Set<string>();
  const stripped = original
    .replace(/\s+(?:Inc\.?|Ltd\.?|LLC|Corp\.?|SAS|GmbH)$/i, '')
    .trim();
  if (stripped.length >= 3 && stripped.toLowerCase() !== original.toLowerCase()) {
    aliases.add(stripped);
  }
  return [...aliases];
}

/**
 * Merge an existing placeholder map with newly detected entities and optional user custom terms.
 * Preserves existing token numbering per EntityType and assigns stable next numbers.
 */
export function buildMap(
  existingMap: PlaceholderEntry[],
  detected: DetectedEntity[],
  customAlwaysRedact: string[] = [],
): PlaceholderEntry[] {
  const map: PlaceholderEntry[] = existingMap.map((entry) => ({
    ...entry,
    aliases: [...entry.aliases],
  }));

  const maxNumberByType = new Map<EntityType, number>();
  const knownOriginals = new Map<string, PlaceholderEntry>();

  for (const entry of map) {
    const parsed = parseTokenIndex(entry.token);
    if (parsed) {
      const prev = maxNumberByType.get(parsed.type) ?? 0;
      if (parsed.index > prev) {
        maxNumberByType.set(parsed.type, parsed.index);
      }
    }
    knownOriginals.set(entry.original.toLowerCase(), entry);
    for (const alias of entry.aliases) {
      knownOriginals.set(alias.toLowerCase(), entry);
    }
  }

  const allCandidates: DetectedEntity[] = [
    ...customAlwaysRedact
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .map((text): DetectedEntity => ({ text, type: 'OTHER', detectedBy: 'user' })),
    ...detected,
  ];

  // Sort candidates longest-first so "Acme Inc." is registered before "Acme",
  // and when lengths are equal, prefer name types over regex types.
  allCandidates.sort((a, b) => {
    const lenDiff = b.text.trim().length - a.text.trim().length;
    if (lenDiff !== 0) return lenDiff;
    const aIsName = isNameEntityType(a.type) ? 1 : 0;
    const bIsName = isNameEntityType(b.type) ? 1 : 0;
    return bIsName - aIsName;
  });

  for (const item of allCandidates) {
    const clean = item.text.trim();
    if (clean.length < 2) continue;

    const lower = clean.toLowerCase();
    const existing = knownOriginals.get(lower);
    if (existing) {
      if (
        existing.original !== clean &&
        !existing.aliases.some((a) => a.toLowerCase() === lower)
      ) {
        existing.aliases.push(clean);
      }
      continue;
    }

    const nextNum = (maxNumberByType.get(item.type) ?? 0) + 1;
    maxNumberByType.set(item.type, nextNum);

    const token = `[${item.type}_${nextNum}]`;
    const aliases = deriveAliases(clean, item.type);
    const entry: PlaceholderEntry = {
      token,
      type: item.type,
      original: clean,
      aliases,
      detectedBy: item.detectedBy,
      enabled: true,
    };

    map.push(entry);
    knownOriginals.set(lower, entry);
    for (const alias of aliases) {
      if (!knownOriginals.has(alias.toLowerCase())) {
        knownOriginals.set(alias.toLowerCase(), entry);
      }
    }
  }

  return map;
}

interface CandidateMatch {
  start: number;
  end: number;
  original: string;
  token: string;
  type: EntityType;
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[a-zA-Z0-9_]/.test(ch);
}

/**
 * Replace all occurrences of enabled entries in `map` with their `[TYPE_N]` tokens.
 * Longest match wins at any overlapping position so a name inside another name
 * (e.g. "Acme" vs "Acme Cloud") never corrupts the outer span.
 */
export function applyMapWithSpans(
  text: string,
  map: PlaceholderEntry[],
): { abstracted: string; spans: TextSpan[] } {
  const enabledEntries = map.filter((e) => e.enabled);
  if (enabledEntries.length === 0 || text.length === 0) {
    return { abstracted: text, spans: [] };
  }

  // Build search terms (original + aliases) sorted longest first
  const searchTerms: { term: string; entry: PlaceholderEntry }[] = [];
  for (const entry of enabledEntries) {
    searchTerms.push({ term: entry.original, entry });
    for (const alias of entry.aliases) {
      if (alias.trim().length >= 2) {
        searchTerms.push({ term: alias.trim(), entry });
      }
    }
  }
  searchTerms.sort((a, b) => b.term.length - a.term.length);

  const candidates: CandidateMatch[] = [];

  for (const { term, entry } of searchTerms) {
    const flags = isNameEntityType(entry.type) ? 'gi' : 'g';
    const re = new RegExp(escapeRegExp(term), flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      // Enforce word boundaries when the term starts/ends with a word char
      // so "Dana" doesn't match inside "Danube" and "10" doesn't match inside "100".
      const firstChar = term[0];
      const lastChar = term[term.length - 1];
      if (isWordChar(firstChar) && isWordChar(text[start - 1])) continue;
      if (isWordChar(lastChar) && isWordChar(text[end])) continue;

      // Do not match inside an already-bracketed token like [COMPANY_1]
      if (text[start - 1] === '[' && text[end] === ']') continue;

      candidates.push({
        start,
        end,
        original: m[0],
        token: entry.token,
        type: entry.type,
      });
    }
  }

  // Greedy selection: longest span first, then earliest start
  candidates.sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  const accepted: CandidateMatch[] = [];
  for (const cand of candidates) {
    const overlapsExisting = accepted.some(
      (ex) => cand.start < ex.end && ex.start < cand.end,
    );
    if (!overlapsExisting) {
      accepted.push(cand);
    }
  }

  // Sort in document order to build the abstracted string
  accepted.sort((a, b) => a.start - b.start);

  let abstracted = '';
  let cursor = 0;
  const spans: TextSpan[] = [];

  for (const span of accepted) {
    abstracted += text.slice(cursor, span.start);
    abstracted += span.token;
    spans.push({
      start: span.start,
      end: span.end,
      original: span.original,
      token: span.token,
      type: span.type,
    });
    cursor = span.end;
  }
  abstracted += text.slice(cursor);

  return { abstracted, spans };
}

export function applyMap(text: string, map: PlaceholderEntry[]): string {
  return applyMapWithSpans(text, map).abstracted;
}

const TOKEN_PATTERN =
  /\[?(COMPANY|PERSON|PRODUCT|PLACE|OTHER|MONEY|PERCENT|NUMBER|DATE|CONTACT)_(\d+)\]?/g;

/** Extract all `[TYPE_N]` tokens present in a prompt string. */
export function extractTokens(promptText: string): Set<string> {
  const found = new Set<string>();
  const re = new RegExp(TOKEN_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(promptText)) !== null) {
    found.add(`[${m[1]}_${m[2]}]`);
  }
  return found;
}

/**
 * Swap `[TYPE_N]` (or unbracketed `TYPE_N`) placeholders back to real names at render time.
 *
 * Security / anti-hallucination rule:
 * - Only swaps tokens that were present in `sentTokens` (when provided) AND exist in `map`.
 * - Any other `[TYPE_N]` (such as an invented `[COMPANY_2]`) renders as a neutral phrase
 *   ("a company", "a person", "an amount", etc.) and is logged.
 */
export function rehydrate(
  text: string,
  map: PlaceholderEntry[],
  sentTokens?: Iterable<string> | string,
): string {
  const byToken = new Map<string, PlaceholderEntry>();
  for (const entry of map) {
    if (entry.enabled) {
      byToken.set(normalizeToken(entry.token), entry);
    }
  }

  let allowedSet: Set<string> | null = null;
  if (typeof sentTokens === 'string') {
    allowedSet = extractTokens(sentTokens);
  } else if (sentTokens !== undefined) {
    allowedSet = new Set<string>();
    for (const t of sentTokens) {
      allowedSet.add(normalizeToken(t));
    }
  }

  const re = new RegExp(TOKEN_PATTERN.source, 'g');
  return text.replace(re, (_fullMatch, rawType: string, rawNum: string) => {
    const type = rawType as EntityType;
    const canonicalToken = `[${type}_${rawNum}]`;
    const entry = byToken.get(canonicalToken);

    const isAllowed =
      entry !== undefined &&
      (allowedSet === null || allowedSet.has(canonicalToken));

    if (isAllowed && entry) {
      return entry.original;
    }

    const neutral = NEUTRAL_PHRASES[type] ?? 'an entity';
    inventedTokenLogs.push({
      token: canonicalToken,
      replacement: neutral,
      ts: Date.now(),
    });
    return neutral;
  });
}
