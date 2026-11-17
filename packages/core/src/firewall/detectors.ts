export type EntityType =
  | 'COMPANY'
  | 'PERSON'
  | 'PRODUCT'
  | 'PLACE'
  | 'OTHER'
  | 'MONEY'
  | 'PERCENT'
  | 'NUMBER'
  | 'DATE'
  | 'CONTACT';

export interface DetectedEntity {
  text: string;
  type: EntityType;
  detectedBy: 'ai' | 'regex' | 'user';
}

interface RawSpan {
  start: number;
  end: number;
  text: string;
  type: EntityType;
}

function overlaps(a: RawSpan, b: RawSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Deterministic regex detectors for MONEY, PERCENT, NUMBER, DATE and CONTACT (email, URL, phone).
 */
export function detectRegexEntities(text: string): DetectedEntity[] {
  const spans: RawSpan[] = [];

  const addMatches = (regex: RegExp, type: EntityType) => {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0].trim();
      if (!value) continue;
      const start = match.index + match[0].indexOf(value);
      const end = start + value.length;
      const candidate: RawSpan = { start, end, text: value, type };
      if (!spans.some((existing) => overlaps(existing, candidate))) {
        spans.push(candidate);
      }
    }
  };

  // 1. CONTACT: URLs and emails first
  addMatches(/https?:\/\/[^\s),;"'>]+/gi, 'CONTACT');
  addMatches(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, 'CONTACT');

  // 2. DATE: ISO dates, slash dates, month-name dates, quarters (before phone regex so 2026-12-01 is DATE)
  addMatches(/\b\d{4}-\d{2}-\d{2}\b/g, 'DATE');
  addMatches(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, 'DATE');
  addMatches(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
    'DATE',
  );
  addMatches(
    /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?\b/gi,
    'DATE',
  );
  addMatches(/\bQ[1-4]\s+\d{4}\b/g, 'DATE');

  // 3. CONTACT: phone numbers (at least 3 groups totaling >= 7 digits)
  addMatches(
    /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\b\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}\b/g,
    'CONTACT',
  );

  // 4. MONEY: symbols ($ € £ ¥) or currency codes (USD, EUR, GBP, MAD, CAD, AUD, CHF)
  addMatches(
    /(?:[$€£¥]|(?:\b(?:USD|EUR|GBP|MAD|CAD|AUD|CHF)\s*))(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:[KMBTkmbt]\b|million\b|billion\b|thousand\b|bn\b|mn\b))?(?:\s*(?:ARR|MRR))?/g,
    'MONEY',
  );
  addMatches(
    /\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:[KMBTkmbt]|million|billion|thousand|bn|mn)?\s*(?:USD|EUR|GBP|MAD|CAD|AUD|CHF|dollars|euros|pounds|dirhams)\b/gi,
    'MONEY',
  );

  // 5. PERCENT
  addMatches(/\b\d+(?:\.\d+)?\s*%/g, 'PERCENT');

  // 5. NUMBER: comma-separated numbers, decimals, or numbers with ≥ 2 digits
  addMatches(/\b(?:\d{1,3}(?:,\d{3})+|\d{2,})(?:\.\d+)?\b/g, 'NUMBER');

  spans.sort((a, b) => a.start - b.start);

  const seen = new Set<string>();
  const out: DetectedEntity[] = [];
  for (const s of spans) {
    const key = `${s.type}:${s.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: s.text, type: s.type, detectedBy: 'regex' });
  }
  return out;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'before', 'after', 'between',
  'both', 'but', 'by', 'can', 'could', 'current', 'currently', 'customer', 'customers',
  'day', 'days', 'each', 'early', 'every', 'first', 'second', 'third', 'for', 'founder',
  'founders', 'from', 'goal', 'growth', 'has', 'have', 'how', 'however', 'if', 'in',
  'into', 'investor', 'investors', 'is', 'it', 'its', 'launch', 'launching', 'lead',
  'leads', 'market', 'markets', 'month', 'months', 'more', 'most', 'move', 'next', 'no',
  'not', 'now', 'of', 'on', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'only', 'or', 'other', 'our', 'out', 'over', 'per', 'plan',
  'plans', 'player', 'price', 'pricing', 'product', 'products', 'quarter', 'quarters',
  'reach', 'revenue', 'rival', 'rivals', 'round', 'rounds', 'sales', 'seat', 'seats',
  'seed', 'self', 'series', 'so', 'some', 'startup', 'startups', 'strategy', 'target',
  'targeting', 'team', 'teams', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'tier', 'time', 'to', 'tool', 'tools',
  'total', 'trial', 'under', 'until', 'up', 'user', 'users', 'using', 'versus', 'via',
  'we', 'week', 'weeks', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will',
  'with', 'within', 'without', 'work', 'working', 'would', 'year', 'years', 'you', 'your',
  'arr', 'mrr', 'cac', 'ltv', 'roi', 'kpi', 'kpis', 'saas', 'b2b', 'b2c', 'api', 'apis',
  'sdk', 'ai', 'ml', 'llm', 'ui', 'ux', 'vc', 'vcs', 'ceo', 'cto', 'cfo', 'coo', 'vp',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun',
  'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'q1', 'q2', 'q3', 'q4',
  'enterprise', 'mid-market', 'smb', 'freelancer', 'freelancers', 'incumbent', 'incumbents',
  'objective', 'brief', 'summary', 'note', 'notes', 'step', 'steps', 'phase', 'version',
]);

const COMPANY_HINTS =
  /\b(?:Inc\.?|Ltd\.?|LLC|Corp\.?|SAS|GmbH|Labs|Ventures|Capital|Partners|Systems|Logistics|Cloud|Pay|Tech|Airlines|Bank|Group|Studio|Studios|Health|Bio|Energy|Motors|Foods|Media|Networks|Security|Analytics|Robotics|Dynamics)\b/i;

const PRODUCT_HINTS = /\b(?:Project|Platform|Suite|Engine|OS|App|Pro|Cloud|Pulse|Core|Flow|Pilot|Forge|Sync|Vault|Shield|Radar)\b/;

const KNOWN_PLACES = new Set([
  'casablanca', 'rabat', 'marrakech', 'tangier', 'morocco', 'lyon', 'paris', 'france',
  'london', 'berlin', 'munich', 'germany', 'madrid', 'barcelona', 'spain', 'amsterdam',
  'dublin', 'zurich', 'geneva', 'milan', 'rome', 'lisbon', 'stockholm', 'oslo', 'warsaw',
  'new york', 'san francisco', 'austin', 'boston', 'chicago', 'seattle', 'los angeles',
  'toronto', 'vancouver', 'montreal', 'tokyo', 'osaka', 'singapore', 'seoul', 'sydney',
  'melbourne', 'dubai', 'riyadh', 'cairo', 'lagos', 'nairobi', 'johannesburg', 'sao paulo',
]);

function classifyHeuristicName(
  phrase: string,
  fullText: string,
  matchIndex: number,
): EntityType {
  const lower = phrase.toLowerCase();
  if (KNOWN_PLACES.has(lower)) {
    return 'PLACE';
  }

  const before = fullText.slice(Math.max(0, matchIndex - 16), matchIndex);
  if (/\b(?:in|from|at|to|across|near)\s+$/i.test(before) && !COMPANY_HINTS.test(phrase)) {
    const words = phrase.split(/\s+/);
    if (words.length <= 2 && !phrase.startsWith('Project ')) {
      return 'PLACE';
    }
  }

  if (phrase.startsWith('Project ') || PRODUCT_HINTS.test(phrase)) {
    return 'PRODUCT';
  }

  if (COMPANY_HINTS.test(phrase)) {
    return 'COMPANY';
  }

  const after = fullText.slice(matchIndex + phrase.length, matchIndex + phrase.length + 28);
  if (/^\s*(?:leads|founded|joined|is\s+our|is\s+the\s+(?:ceo|cto|cfo|vp|head|founder|director))/i.test(after)) {
    return 'PERSON';
  }
  if (/\b(?:CEO|CTO|CFO|founder|co-founder|lead|director|partner)\s+$/i.test(before)) {
    return 'PERSON';
  }

  const words = phrase.split(/\s+/);
  if (
    words.length === 2 &&
    words.every((w) => /^[A-Z][a-z]{1,15}$/.test(w))
  ) {
    return 'PERSON';
  }

  return 'COMPANY';
}

function isSentenceStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const preceding = text.slice(Math.max(0, index - 4), index);
  return /[.!?\n]\s*$/.test(preceding);
}

/**
 * Deterministic fallback name detector when Gemini Nano is unavailable.
 * Extracts capitalised proper-noun runs minus a stop list and sentence-initial common words.
 */
export function detectCapitalisedRuns(text: string): DetectedEntity[] {
  const results: DetectedEntity[] = [];
  const seen = new Set<string>();

  // Match 1 to 4 capitalised words without crossing sentence-ending periods
  const runRegex =
    /\b([A-Z][a-zA-Z0-9&'-]*(?:\s+[A-Z][a-zA-Z0-9&'-]*){0,3}(?:\.)?)\b/g;

  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(text)) !== null) {
    const rawPhrase = match[1];
    const words = rawPhrase.split(/\s+/);

    // Strip leading/trailing stop words from the run
    let startWord = 0;
    while (startWord < words.length && STOP_WORDS.has(words[startWord].replace(/\.$/, '').toLowerCase())) {
      startWord++;
    }
    let endWord = words.length - 1;
    while (endWord >= startWord && STOP_WORDS.has(words[endWord].replace(/\.$/, '').toLowerCase())) {
      endWord--;
    }

    if (startWord > endWord) continue;

    const trimmedWords = words.slice(startWord, endWord + 1);
    const phrase = trimmedWords
      .join(' ')
      .replace(/(?<!\b(?:Inc|Ltd|Corp|LLC))\.$/i, '');
    if (phrase.length < 2) continue;

    const phraseOffset = rawPhrase.indexOf(phrase);
    const actualIndex = match.index + (phraseOffset >= 0 ? phraseOffset : 0);

    // Skip all-caps acronyms already in stop words or short generic tokens
    if (STOP_WORDS.has(phrase.replace(/\.$/, '').toLowerCase())) continue;

    // If a single word appears at sentence start, only keep it if it also appears mid-sentence
    // or is a known place / camelCase / non-dictionary proper noun
    if (trimmedWords.length === 1 && isSentenceStart(text, actualIndex)) {
      const lower = phrase.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;
    }

    // Skip existing bracketed tokens like [COMPANY_1]
    if (actualIndex > 0 && text[actualIndex - 1] === '[') continue;

    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const type = classifyHeuristicName(phrase, text, actualIndex);
    results.push({
      text: phrase,
      type,
      detectedBy: 'regex',
    });
  }

  return results;
}
