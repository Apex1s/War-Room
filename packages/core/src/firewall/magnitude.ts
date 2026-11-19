import type { EntityType } from './detectors';
import type { PlaceholderEntry } from './placeholders';

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: '$',
  '€': '€',
  '£': '£',
  '¥': '¥',
  usd: '$',
  dollars: '$',
  eur: '€',
  euros: '€',
  gbp: '£',
  pounds: '£',
  mad: 'MAD ',
  dirhams: 'MAD ',
  cad: 'CAD ',
  aud: 'AUD ',
  chf: 'CHF ',
};

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
};

interface BucketBound {
  max: number;
  label: (prefix: string) => string;
}

const MONEY_BUCKETS: BucketBound[] = [
  { max: 100, label: (p) => `under ${p}100` },
  { max: 1_000, label: (p) => `between ${p}100 and ${p}1K` },
  { max: 10_000, label: (p) => `between ${p}1K and ${p}10K` },
  { max: 100_000, label: (p) => `between ${p}10K and ${p}100K` },
  { max: 500_000, label: (p) => `between ${p}100K and ${p}500K` },
  { max: 1_000_000, label: (p) => `between ${p}500K and ${p}1M` },
  { max: 5_000_000, label: (p) => `between ${p}1M and ${p}5M` },
  { max: 25_000_000, label: (p) => `between ${p}5M and ${p}25M` },
  { max: 100_000_000, label: (p) => `between ${p}25M and ${p}100M` },
  { max: 1_000_000_000, label: (p) => `between ${p}100M and ${p}1B` },
];

const NUMBER_BUCKETS: { max: number; label: string }[] = [
  { max: 10, label: 'under ten' },
  { max: 50, label: 'between 10 and 50' },
  { max: 100, label: 'between 50 and 100' },
  { max: 500, label: 'between 100 and 500' },
  { max: 1_000, label: 'between 500 and 1K' },
  { max: 5_000, label: 'between 1K and 5K' },
  { max: 10_000, label: 'between 5K and 10K' },
  { max: 50_000, label: 'between 10K and 50K' },
  { max: 100_000, label: 'between 50K and 100K' },
  { max: 1_000_000, label: 'between 100K and 1M' },
];

function parseNumericValue(original: string): { value: number; currencyPrefix: string } | null {
  const trimmed = original.trim();

  // Detect currency symbol or code
  let currencyPrefix = '$';
  const symMatch = /^([$€£¥])/.exec(trimmed);
  if (symMatch) {
    currencyPrefix = CURRENCY_SYMBOLS[symMatch[1]] ?? '$';
  } else {
    const codeMatch = /\b(USD|EUR|GBP|MAD|CAD|AUD|CHF|dollars|euros|pounds|dirhams)\b/i.exec(
      trimmed,
    );
    if (codeMatch) {
      currencyPrefix = CURRENCY_SYMBOLS[codeMatch[1].toLowerCase()] ?? '$';
    }
  }

  // Extract the numeric part and optional magnitude suffix
  const numMatch =
    /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|m|b|t|mn|bn|thousand|million|billion)?\b/i.exec(
      trimmed,
    );
  if (!numMatch) return null;

  const intPart = numMatch[1].replace(/,/g, '');
  const fracPart = numMatch[2] ? `.${numMatch[2]}` : '';
  const base = Number(`${intPart}${fracPart}`);
  if (!Number.isFinite(base) || base < 0) return null;

  const suffix = numMatch[3]?.toLowerCase();
  const multiplier = suffix ? (MULTIPLIERS[suffix] ?? 1) : 1;

  return { value: base * multiplier, currencyPrefix };
}

/**
 * Deterministic magnitude bucket for MONEY and NUMBER entries.
 * Never returns the exact original value (always a coarse range like "between $100K and $500K").
 */
export function computeMagnitudeHint(
  original: string,
  type: EntityType,
): string | undefined {
  if (type !== 'MONEY' && type !== 'NUMBER') return undefined;

  const parsed = parseNumericValue(original);
  if (!parsed) return undefined;

  const { value, currencyPrefix } = parsed;

  if (type === 'MONEY') {
    for (const bucket of MONEY_BUCKETS) {
      if (value < bucket.max) {
        return bucket.label(currencyPrefix);
      }
    }
    return `over ${currencyPrefix}1B`;
  }

  // NUMBER
  for (const bucket of NUMBER_BUCKETS) {
    if (value < bucket.max) {
      return bucket.label;
    }
  }
  return 'over 1,000,000';
}

/**
 * Build the cloud-safe magnitude legend lines from a placeholder map.
 * One line per enabled MONEY/NUMBER entry whose hint is enabled and present,
 * e.g. "[MONEY_1]: between $100K and $500K".
 *
 * Guarantees that no legend line contains the entry's original value (case-insensitive)
 * or any exact multi-digit number from the original string.
 */
export function buildMagnitudeLegend(map: PlaceholderEntry[]): string[] {
  const lines: string[] = [];

  for (const entry of map) {
    if (!entry.enabled) continue;
    if (entry.type !== 'MONEY' && entry.type !== 'NUMBER') continue;
    if (entry.hintEnabled === false) continue;

    const hint = entry.hint ?? computeMagnitudeHint(entry.original, entry.type);
    if (!hint) continue;

    // Safety check: ensure the legend line never leaks the exact original value
    const cleanOrig = entry.original.trim().toLowerCase();
    const esc = cleanOrig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryRe = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
    if (cleanOrig.length >= 2 && boundaryRe.test(hint.toLowerCase())) {
      continue;
    }

    lines.push(`${entry.token}: ${hint}`);
  }

  return lines;
}
