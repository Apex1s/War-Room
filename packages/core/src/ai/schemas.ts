import { z } from 'zod';
import type { PromptTask } from '../../prompts/types';

/**
 * Output schemas for the six router tasks. One zod schema per task is the single source
 * of truth: it produces the on-device `responseConstraint`, the cloud `responseSchema`,
 * and the runtime validation.
 *
 * Wire-schema rules, so the same schema works for Gemini Nano and for the cloud models:
 * - only object, array, string, number/integer, boolean and enum
 * - every field is required; "nothing" is "" or [], never null or a missing key
 * - no unions, no transforms, no refinements (clamping and truncation happen in TaskSpec.normalize)
 * - no maxLength on strings: an over-long string is truncated in the UI, not repaired by a second call
 *
 * The field names here are described in the system prompts in ../../prompts.
 * Change both or neither.
 */

export const NameEntityType = z.enum(['COMPANY', 'PERSON', 'PRODUCT', 'PLACE', 'OTHER']);

export const RedactOutput = z.object({
  entities: z
    .array(z.object({ text: z.string().min(1), type: NameEntityType }))
    .max(40),
});

export const CrowdOutput = z.object({
  reactions: z
    .array(
      z.object({
        personaId: z.string(),
        quote: z.string().min(1),
        sentiment: z.number().int().min(-2).max(2),
      }),
    )
    .min(1)
    .max(12),
});

export const RefereeLiveOutput = z.object({
  clarity: z.number().int().min(1).max(5),
  risk: z.enum(['low', 'medium', 'high']),
  tip: z.string(),
  /** The earlier commitment the draft breaks, or "" when there is none. */
  contradicts: z.string(),
});

export const RefereeRoundOutput = z.object({
  summary: z.string().min(1),
  scores: z
    .array(z.object({ generalId: z.string(), delta: z.number().int().min(-2).max(2) }))
    .min(1)
    .max(4),
  /** One sentence naming the broken commitment, or "" when there is none. */
  contradiction: z.string(),
  commitments: z.array(z.string()).max(2),
});

export const GeneralMoveOutput = z.object({
  headline: z.string().min(1),
  move: z.string().min(1),
  rationale: z.string().min(1),
  threatLevel: z.number().int().min(1).max(5),
  targets: z.string(),
});

export const FinalReportOutput = z.object({
  verdict: z.enum(['plan_holds', 'holds_with_changes', 'plan_breaks']),
  verdictLine: z.string().min(1),
  summary: z.string().min(1),
  risks: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().min(1),
        severity: z.enum(['high', 'medium', 'low']),
        raisedBy: z.string(),
      }),
    )
    .length(3),
  counterStrategies: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().min(1),
        addressesRisk: z.number().int().min(1).max(3),
      }),
    )
    .length(3),
  nextSteps: z.array(z.string().min(1)).min(3).max(5),
  confidence: z.enum(['low', 'medium', 'high']),
});

/** `satisfies` fails the build if this set of tasks drifts from the prompts' `PromptTask`. */
export const OUTPUT_SCHEMAS = {
  redact: RedactOutput,
  crowd: CrowdOutput,
  referee_live: RefereeLiveOutput,
  referee_round: RefereeRoundOutput,
  general_move: GeneralMoveOutput,
  final_report: FinalReportOutput,
} as const satisfies Record<PromptTask, z.ZodType>;

export type Task = keyof typeof OUTPUT_SCHEMAS;
export type TaskOutput = { [K in Task]: z.infer<(typeof OUTPUT_SCHEMAS)[K]> };

export type RedactOutput = TaskOutput['redact'];
export type CrowdOutput = TaskOutput['crowd'];
export type CrowdReaction = CrowdOutput['reactions'][number];
export type RefereeLiveOutput = TaskOutput['referee_live'];
export type RefereeRoundOutput = TaskOutput['referee_round'];
export type GeneralMoveOutput = TaskOutput['general_move'];
export type FinalReportOutput = TaskOutput['final_report'];

/** JSON Schema for Chrome's `responseConstraint` (on-device). */
export function deviceSchema(task: Task): Record<string, unknown> {
  const { $schema: _dropped, ...rest } = z.toJSONSchema(OUTPUT_SCHEMAS[task]) as Record<string, unknown>;
  return rest;
}

const GEMINI_KEYS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
]);

/** Reduce a JSON Schema to the OpenAPI subset that Gemini's `responseSchema` accepts. */
export function toGeminiSchema(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!GEMINI_KEYS.has(key)) continue;
    if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, schema]) => [name, toGeminiSchema(schema)]),
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Schema for the cloud model's `generationConfig.responseSchema`. */
export function cloudSchema(task: Task): unknown {
  return toGeminiSchema(deviceSchema(task));
}

/**
 * Crowd schema for one specific call: exactly one reaction per requested persona, and
 * personaId restricted to those ids. Without this, Gemini Nano filled the list up to the
 * generic maximum of 12 with invented personas, and on a CPU every extra token costs time
 * (one requested persona took 122 s warm on the dev machine). Pass the ids in prompt order.
 */
export function crowdDeviceSchema(personaIds: string[]): Record<string, unknown> {
  if (personaIds.length === 0) throw new RangeError('crowdDeviceSchema needs at least one persona id');
  const schema = structuredClone(deviceSchema('crowd')) as {
    properties: { reactions: { minItems?: number; maxItems?: number; items: { properties: { personaId: Record<string, unknown> } } } };
  };
  const reactions = schema.properties.reactions;
  reactions.minItems = personaIds.length;
  reactions.maxItems = personaIds.length;
  reactions.items.properties.personaId = { type: 'string', enum: [...personaIds] };
  return schema as unknown as Record<string, unknown>;
}

/** Cloud counterpart of `crowdDeviceSchema`, for the batched cloud fallback. */
export function crowdCloudSchema(personaIds: string[]): unknown {
  return toGeminiSchema(crowdDeviceSchema(personaIds));
}

/**
 * referee_round schema for one specific round: exactly one score per General, generalId
 * restricted to those ids (pass them in the order the prompt lists the replies). Same reason
 * as `crowdDeviceSchema`: unconstrained arrays let Nano pad the output, which costs seconds.
 */
export function refereeRoundDeviceSchema(generalIds: string[]): Record<string, unknown> {
  if (generalIds.length === 0) throw new RangeError('refereeRoundDeviceSchema needs at least one general id');
  const schema = structuredClone(deviceSchema('referee_round')) as {
    properties: { scores: { minItems?: number; maxItems?: number; items: { properties: { generalId: Record<string, unknown> } } } };
  };
  const scores = schema.properties.scores;
  scores.minItems = generalIds.length;
  scores.maxItems = generalIds.length;
  scores.items.properties.generalId = { type: 'string', enum: [...generalIds] };
  return schema as unknown as Record<string, unknown>;
}

/** Cloud counterpart of `refereeRoundDeviceSchema`. */
export function refereeRoundCloudSchema(generalIds: string[]): unknown {
  return toGeminiSchema(refereeRoundDeviceSchema(generalIds));
}
