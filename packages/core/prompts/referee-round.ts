import { LIMITS, clip, numbered, type PromptSpec } from './types';

/**
 * referee_round: THE REFEREE, verdict after each round.
 * PREFER_ON_DEVICE with cloud fallback. Input is abstracted, so the fallback is safe.
 *
 * Output schema: RefereeRoundOutput  { summary, scores: { generalId, delta }[], contradiction, commitments }
 * After the call: one score per known generalId (missing ones get 0), clamp delta to -2..2,
 * drop commitments that are already recorded.
 */
const SYSTEM = `You are the neutral referee of a turn-based war game between a Player and several Opponents. Return JSON only. Plain punctuation, no dashes.

After reading the round, give:
- summary: 2 sentences on what changed this round. No advice.
- scores: one entry per opponent. delta is who won that exchange: 2 the Player's move clearly beat this opponent's reply, 1 Player ahead, 0 even, -1 opponent ahead, -2 the opponent's reply clearly beat the Player.
- contradiction: if the Player's move breaks one of their earlier commitments, say which in one sentence. Otherwise use "".
- commitments: up to 2 firm promises the Player made in this move, each under 12 words, for example "No price cuts before Q3". If none, use [].

Be strict and fair. A vague move does not beat a specific reply.
Names in square brackets such as [COMPANY_1] are placeholders. Keep them exactly as written.
Use each generalId exactly as given.`;

export const refereeRoundPrompt: PromptSpec<'referee_round'> = {
  target: 'on-device',
  system: () => SYSTEM,
  user: (i) => `Earlier commitments
${numbered(i.commitments.slice(-LIMITS.commitments), 'none')}

Round ${i.round} of ${i.totalRounds}
Player move: """${clip(i.move, LIMITS.move)}"""

Opponent replies
${i.replies
  .map((r) => `- ${r.generalId} (${r.name}), threat ${r.threatLevel}/5: ${clip(r.move, LIMITS.reply)}`)
  .join('\n')}

JSON:`,
};
