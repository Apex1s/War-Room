import { LIMITS, clip, type PromptSpec } from './types';

/**
 * crowd: THE CROWD, short in-character reactions to a round.
 * PREFER_ON_DEVICE. One persona per call on Gemini Nano; all personas in one call
 * when it falls back to the cloud. Same prompt for both.
 *
 * Output schema: CrowdOutput  { reactions: { personaId, quote, sentiment }[] }
 * After the call: keep only requested personaIds, clamp sentiment to -2..2.
 */
const SYSTEM = `You voice ordinary people reacting to one round of a business contest. Return JSON only. Plain punctuation, no dashes.

Write exactly one reaction for each persona listed, in the order listed, and no others. Do not voice the Player or the opponents.
Each reaction is what that person would say out loud:
- first person, 1 or 2 short sentences, at most 25 words, everyday words
- in character: their reaction follows from who they are, not from what is sensible
- react to this round only

sentiment is how the persona feels about the Player's move:
-2 hates it, -1 dislikes it, 0 unsure, 1 likes it, 2 loves it.

People disagree. Do not make every reaction positive.
Names in square brackets such as [COMPANY_1] are placeholders. Keep them exactly as written.
Never make up your own square brackets. For a company with no placeholder, say "my current vendor" or "the big player".
Use each personaId exactly as given.`;

export const crowdPrompt: PromptSpec<'crowd'> = {
  target: 'on-device',
  system: () => SYSTEM,
  user: (i) => `Situation: ${clip(i.situation, LIMITS.situation)}

This round
- Player: ${clip(i.userHeadline, LIMITS.headline)}
${i.generalHeadlines.map((g) => `- ${g.name}: ${clip(g.headline, LIMITS.headline)}`).join('\n')}

Personas
${i.personas.map((p) => `- ${p.id}: ${p.label}. ${p.outlook}`).join('\n')}

JSON:`,
};
