/**
 * Shared types for the six agent prompts.
 * No imports from the rest of core: this folder must stay dependency-free so the
 * prompts can be read, tested and tuned on their own.
 */

/** Must stay identical to `Task` in src/ai/schemas.ts. */
export type PromptTask =
  | 'redact'
  | 'crowd'
  | 'referee_live'
  | 'referee_round'
  | 'general_move'
  | 'final_report';

export interface GeneralSpec {
  id: string; // 'vc'
  name: string; // 'Skeptical VC'
  role: string; // 'a partner at an early-stage fund who has heard this pitch forty times'
  persona: string; // 3–5 sentences
  goal: string;
  hiddenInfo: string; // private to the General until the final report
  style: string;
  color: string; // UI only, unused by prompts
}

export interface CrowdPersona {
  id: string; // 'p1'
  label: string; // 'Price-sensitive freelancer'
  outlook: string; // one sentence
}

/**
 * The part of a finished round the prompts read. `RoundRecord` in src/game/types.ts
 * is structurally assignable to this, so the engine can pass its records directly.
 * All text here is ABSTRACTED (placeholders, never real names).
 */
export interface PromptRound {
  n: number;
  userMove: string;
  generalMoves: {
    generalId: string;
    headline: string;
    move: string;
    rationale: string;
    threatLevel: number;
  }[];
  crowd: { sentiment: number }[];
  referee: { summary: string; contradiction: string } | null;
}

export interface PromptInput {
  /** RAW text. One chunk; the firewall does the chunking. */
  redact: { text: string };

  crowd: {
    situation: string; // template line + abstracted objective
    userHeadline: string; // abstracted move, shortened
    generalHeadlines: { name: string; headline: string }[];
    personas: CrowdPersona[]; // 1 per call on-device, up to 12 in the cloud
  };

  /** `draft` is RAW text; commitments and threats are abstracted. Never leaves the device. */
  referee_live: {
    draft: string;
    commitments: string[];
    threats: { name: string; headline: string }[]; // from the previous round
  };

  referee_round: {
    round: number;
    totalRounds: number;
    move: string; // abstracted
    replies: { generalId: string; name: string; threatLevel: number; move: string }[];
    commitments: string[];
  };

  general_move: {
    general: GeneralSpec;
    otherGenerals: { id: string; name: string }[];
    objective: string; // abstracted
    brief: string; // abstracted
    legend: string[]; // optional magnitude hints, e.g. "[MONEY_1]: between $1M and $5M"
    history: PromptRound[];
    round: number;
    totalRounds: number;
    move: string; // abstracted
  };

  final_report: {
    generals: GeneralSpec[];
    objective: string;
    brief: string;
    legend: string[];
    rounds: PromptRound[];
    finalScores: { name: string; score: number }[];
  };
}

export interface PromptSpec<K extends PromptTask> {
  /**
   * The model class the prompt is written for.
   * 'on-device' prompts run on Gemini Nano: keep them short, single-purpose, JSON-only.
   * 'cloud' prompts run on the larger models and explain purpose and reasons.
   */
  target: 'on-device' | 'cloud';
  system: (input: PromptInput[K]) => string;
  user: (input: PromptInput[K]) => string;
}

/** Character budgets for on-device prompt inputs (countTokens is unavailable in hybrid mode). */
export const LIMITS = {
  redactChunk: 1800,
  draft: 600,
  move: 600,
  reply: 300,
  headline: 200,
  situation: 240,
  commitments: 5,
} as const;

/** Shorten text to fit an on-device budget. Never use on text that is being redacted. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Numbered list, or a fallback word when empty. */
export function numbered(items: string[], whenEmpty: string): string {
  return items.length ? items.map((item, i) => `${i + 1}. ${item}`).join('\n') : whenEmpty;
}
