import { isDeviceReadyForOnlyOnDevice } from '../ai/device';
import { setVaultEntries } from '../ai/egress-guard';
import { withSealingText } from '../ai/net-guard';
import { run } from '../ai/router';
import { parseUrlOverrides } from '../ai/routing-table';
import { chunkText } from './chunk';
import {
  detectCapitalisedRuns,
  detectRegexEntities,
  type DetectedEntity,
} from './detectors';
import {
  applyMapWithSpans,
  buildMap,
  type PlaceholderEntry,
  type TextSpan,
} from './placeholders';

export interface SealOptions {
  customAlwaysRedact?: string[];
  gameId?: string;
  onProgress?: (progress: number) => void;
}

export interface SealResult {
  abstracted: string;
  map: PlaceholderEntry[];
  spans: TextSpan[];
  method: 'on-device-ai' | 'basic';
}

function findExactOrCaseInsensitiveSubstring(
  text: string,
  candidate: string,
): string | null {
  const trimmed = candidate.trim();
  if (trimmed.length < 2) return null;
  if (text.includes(trimmed)) return trimmed;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx !== -1) {
    return text.slice(idx, idx + trimmed.length);
  }
  return null;
}

export async function seal(
  text: string,
  existingMap: PlaceholderEntry[] = [],
  opts?: SealOptions,
): Promise<SealResult> {
  return withSealingText(text, async () => {
    // 1. Deterministic regex values (MONEY, PERCENT, NUMBER, DATE, CONTACT)
    const values = detectRegexEntities(text);

    // 2. Names: on-device AI when available, else deterministic capitalised-runs heuristic
    let names: DetectedEntity[] = [];
    let method: 'on-device-ai' | 'basic' = 'basic';

    const overrides = parseUrlOverrides();
    const canUseDevice = !overrides.forceCloud && isDeviceReadyForOnlyOnDevice();

    if (canUseDevice) {
      try {
        const chunks = chunkText(text);
        const aiEntities: DetectedEntity[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const res = await run('redact', { text: chunk }, { gameId: opts?.gameId });
          for (const ent of res.output.entities) {
            aiEntities.push({
              text: ent.text,
              type: ent.type,
              detectedBy: 'ai',
            });
          }
          opts?.onProgress?.((i + 1) / chunks.length);
        }

        names = aiEntities;
        method = 'on-device-ai';
      } catch {
        names = detectCapitalisedRuns(text);
        method = 'basic';
        opts?.onProgress?.(1);
      }
    } else {
      names = detectCapitalisedRuns(text);
      method = 'basic';
      opts?.onProgress?.(1);
    }

    // 3. Filter names so only substrings that actually exist in `text` survive
    const verifiedNames: DetectedEntity[] = [];
    for (const n of names) {
      const matched = findExactOrCaseInsensitiveSubstring(text, n.text);
      if (matched) {
        verifiedNames.push({
          text: matched,
          type: n.type,
          detectedBy: n.detectedBy,
        });
      }
    }

    // 4 & 5. Merge existingMap with values, verifiedNames and customAlwaysRedact in order of appearance
    const map = buildMap(
      existingMap,
      [...verifiedNames, ...values],
      opts?.customAlwaysRedact ?? [],
      text,
    );

    // Register map in the egress guard for this game / session
    setVaultEntries(map, opts?.gameId);

    // 6. Substitute placeholders across `text`
    const { abstracted, spans } = applyMapWithSpans(text, map);

    // 7. Return SealResult
    return {
      abstracted,
      map,
      spans,
      method,
    };
  });
}
