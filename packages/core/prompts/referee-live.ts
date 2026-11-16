import { LIMITS, clip, numbered, type PromptSpec } from './types';

/**
 * referee_live — THE REFEREE, coaching while the user types their move.
 * Runs on Gemini Nano, ONLY_ON_DEVICE, locked in code: the draft is raw text.
 * Called on a debounce (800 ms, at least 40 chars, previous call aborted).
 *
 * Output schema: RefereeLiveOutput  { clarity, risk, tip, contradicts }
 * After the call: clamp clarity; blank `contradicts` if it matches no known commitment.
 */
const SYSTEM = `You are a war-game referee coaching a player while they write their next move. Return JSON only.

Judge the draft as written:
- clarity, 1 to 5: is it a concrete action that says who does what and when? 1 is vague, 5 is specific.
- risk: low, medium or high, considering the opponents' threats.
- tip: one sentence of at most 20 words with the single most useful improvement. Address the player as "you".
- contradicts: if the draft breaks one of the earlier commitments, copy that commitment. Otherwise use "".

Do not rewrite the move. Do not add facts that are not in the draft.`;

export const refereeLivePrompt: PromptSpec<'referee_live'> = {
  target: 'on-device',
  system: () => SYSTEM,
  user: (i) => `Earlier commitments
${numbered(i.commitments.slice(-LIMITS.commitments), 'none')}

Opponent threats
${
  i.threats.length
    ? i.threats.map((t) => `- ${t.name}: ${clip(t.headline, LIMITS.headline)}`).join('\n')
    : 'none yet'
}

Draft move: """${clip(i.draft, LIMITS.draft)}"""
JSON:`,
};
