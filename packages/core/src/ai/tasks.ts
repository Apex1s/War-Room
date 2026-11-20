import type { z } from 'zod';
import {
  LIMITS,
  PROMPTS,
  REDACT_EXAMPLE_NAMES,
  type PromptInput,
} from '../../prompts';
import { OUTPUT_SCHEMAS, type Task, type TaskOutput } from './schemas';

export type Privacy = 'raw' | 'abstracted';
export type TaskInput = PromptInput;

export interface TaskSpec<K extends Task> {
  privacy: Privacy;
  system: (input: TaskInput[K]) => string;
  user: (input: TaskInput[K]) => string;
  schema: z.ZodType<TaskOutput[K]>;
  normalize?: (out: TaskOutput[K], input: TaskInput[K]) => TaskOutput[K];
  maxInputChars: number;
}

function clampInt(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function truncateHeadline(raw: string, maxLen = 140): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-]+$/, '').trimEnd()}...`;
}

const SEVERITY_ORDER: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const TASKS: { [K in Task]: TaskSpec<K> } = {
  redact: {
    privacy: 'raw',
    system: PROMPTS.redact.system,
    user: PROMPTS.redact.user,
    schema: OUTPUT_SCHEMAS.redact,
    maxInputChars: LIMITS.redactChunk + 64,
    normalize: (out, input) => {
      const chunk = input.text;
      const chunkLower = chunk.toLowerCase();
      const exampleSet = new Set<string>(REDACT_EXAMPLE_NAMES);
      const seen = new Set<string>();
      const entities: TaskOutput['redact']['entities'] = [];

      for (const item of out.entities) {
        const trimmed = item.text.trim();
        if (trimmed.length < 2) continue;
        if (exampleSet.has(trimmed) && !chunk.includes(trimmed)) continue;

        let matchedText: string | null = null;
        if (chunk.includes(trimmed)) {
          matchedText = trimmed;
        } else {
          const idx = chunkLower.indexOf(trimmed.toLowerCase());
          if (idx !== -1) {
            matchedText = chunk.slice(idx, idx + trimmed.length);
          }
        }
        if (!matchedText) continue;
        // Names are proper nouns: as written in the text they carry a capital letter or a
        // digit. Gemini Nano otherwise masks ordinary words such as "local" or "bakeries",
        // which wrecks the brief the cloud sees. The user can still add any term by hand.
        if (!/[A-Z0-9]/.test(matchedText)) continue;

        const key = matchedText.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        entities.push({ text: matchedText, type: item.type });
      }

      return { entities };
    },
  },

  crowd: {
    privacy: 'abstracted',
    system: PROMPTS.crowd.system,
    user: PROMPTS.crowd.user,
    schema: OUTPUT_SCHEMAS.crowd,
    maxInputChars: 4000,
    normalize: (out, input) => {
      const requestedIds = new Set(input.personas.map((p) => p.id));
      const singleId = input.personas.length === 1 ? input.personas[0].id : null;
      const reactions: TaskOutput['crowd']['reactions'] = [];

      for (const r of out.reactions) {
        const personaId = singleId ?? r.personaId;
        if (!requestedIds.has(personaId)) continue;
        reactions.push({
          personaId,
          quote: r.quote.trim().slice(0, 240),
          sentiment: clampInt(r.sentiment, -2, 2),
        });
      }

      return { reactions };
    },
  },

  referee_live: {
    privacy: 'raw',
    system: PROMPTS.referee_live.system,
    user: PROMPTS.referee_live.user,
    schema: OUTPUT_SCHEMAS.referee_live,
    maxInputChars: 3000,
    normalize: (out, input) => {
      const rawContradicts = out.contradicts.trim();
      let contradicts = '';
      if (rawContradicts.length > 0 && input.commitments.length > 0) {
        const needle = rawContradicts.slice(0, 20).toLowerCase();
        const match = input.commitments.find(
          (c) =>
            c.toLowerCase().includes(needle) ||
            rawContradicts.toLowerCase().includes(c.slice(0, 20).toLowerCase()),
        );
        if (match) {
          contradicts = match;
        }
      }

      return {
        clarity: clampInt(out.clarity, 1, 5),
        risk: out.risk,
        tip: out.tip.trim().slice(0, 160),
        contradicts,
      };
    },
  },

  referee_round: {
    privacy: 'abstracted',
    system: PROMPTS.referee_round.system,
    user: PROMPTS.referee_round.user,
    schema: OUTPUT_SCHEMAS.referee_round,
    maxInputChars: 4500,
    normalize: (out, input) => {
      const byGeneral = new Map<string, number>();
      for (const s of out.scores) {
        byGeneral.set(s.generalId, clampInt(s.delta, -2, 2));
      }
      const scores = input.replies.map((r) => ({
        generalId: r.generalId,
        delta: byGeneral.get(r.generalId) ?? 0,
      }));

      const existing = new Set(input.commitments.map((c) => c.trim().toLowerCase()));
      const commitments = out.commitments
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && !existing.has(c.toLowerCase()))
        .slice(0, 2);

      return {
        summary: out.summary.trim(),
        scores,
        contradiction: input.commitments.length > 0 ? out.contradiction.trim() : '',
        commitments,
      };
    },
  },

  general_move: {
    privacy: 'abstracted',
    system: PROMPTS.general_move.system,
    user: PROMPTS.general_move.user,
    schema: OUTPUT_SCHEMAS.general_move,
    maxInputChars: 24000,
    normalize: (out) => ({
      headline: truncateHeadline(out.headline, 140),
      move: out.move.trim(),
      rationale: out.rationale.trim(),
      threatLevel: clampInt(out.threatLevel, 1, 5),
      targets: out.targets.trim(),
    }),
  },

  final_report: {
    privacy: 'abstracted',
    system: PROMPTS.final_report.system,
    user: PROMPTS.final_report.user,
    schema: OUTPUT_SCHEMAS.final_report,
    maxInputChars: 48000,
    normalize: (out) => ({
      ...out,
      verdictLine: out.verdictLine.trim(),
      summary: out.summary.trim(),
      risks: [...out.risks].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
      ),
      counterStrategies: out.counterStrategies.map((cs) => ({
        ...cs,
        addressesRisk: clampInt(cs.addressesRisk, 1, 3),
      })),
    }),
  },
};
