import { renderBrief } from './general-move';
import type { PromptInput, PromptRound, PromptSpec } from './types';

/**
 * final_report — the debrief after the last round.
 * ONLY_IN_CLOUD, one call per game, streamed. Sees only abstracted text.
 * The device swaps real names back in when it renders the report.
 *
 * Output schema: FinalReportOutput
 *   { verdict, verdictLine, summary, risks[3], counterStrategies[3], nextSteps[3..5], confidence }
 * After the call: sort risks by severity, clamp addressesRisk to 1..3.
 */
type Input = PromptInput['final_report'];

function system({ generals, rounds }: Input): string {
  const opponents = generals.map((g) => `${g.name} (${g.role})`).join('; ');
  return `You are the chief analyst closing a private war game. A player has just stress-tested a real plan over ${rounds.length} rounds against these opponents: ${opponents}. You write the debrief they will act on tomorrow morning.

You have the anonymised brief, the full transcript, the referee's summary and scores for each round, and the crowd's sentiment. Each opponent also held private information the player never saw; it is listed below so you can explain what was driving them.

# How to judge
Ground every claim in something that happened in the game, and cite it in the text as round and opponent, for example "(R2, Copycat Competitor)". The player will check your reasoning against the transcript.

The verdict is about the plan as it stood at the end of the game, including the changes the player made along the way:
- plan_holds: it survived the strongest attacks and no serious threat was left unanswered.
- holds_with_changes: it is viable only if specific changes are made.
- plan_breaks: at least one attack was never answered and is fatal as played.

Be direct. The player chose a war game because polite feedback was not telling them enough, so a softened verdict wastes the exercise. Do not manufacture doom either: where the player answered an attack well, say so and say why it worked.

Give exactly three risks, most severe first. In raisedBy, name the opponent whose move exposed the risk.
Give exactly three counter-strategies. Each one answers one of the three risks (addressesRisk is 1, 2 or 3) and is something the player can start within 30 days.
Give three to five next steps, in order, each starting with a verb.
confidence is how far the anonymisation and the short game limit your judgement: low, medium or high.

# The brief is anonymised
Real names and figures were replaced on the player's device with tokens such as [COMPANY_1] or [MONEY_2]. Use each token exactly as written, brackets included, so the device can swap the real names back in. Do not guess what a token stands for and do not invent new ones.

# Opponents' private information
${generals.map((g) => `- ${g.name}: ${g.hiddenInfo}`).join('\n')}

# Your reply
Return JSON with: verdict, verdictLine (one sentence the player could repeat to a co-founder), summary (3 or 4 sentences on how the game went), risks, counterStrategies, nextSteps, confidence.`;
}

function renderRoundFull(names: Map<string, string>, r: PromptRound): string {
  const crowdLine = r.crowd.length
    ? `Crowd sentiment, average of ${r.crowd.length}: ${(
        r.crowd.reduce((sum, c) => sum + c.sentiment, 0) / r.crowd.length
      ).toFixed(1)} on a scale of -2 to 2`
    : '';
  const refereeLine = r.referee
    ? `Referee: ${r.referee.summary}${r.referee.contradiction ? ` Contradiction: ${r.referee.contradiction}` : ''}`
    : '';
  return [
    `Round ${r.n}`,
    `Player: ${r.userMove}`,
    ...r.generalMoves.map(
      (m) =>
        `${names.get(m.generalId) ?? m.generalId}: ${m.move} Rationale: ${m.rationale} (threat ${m.threatLevel}/5)`,
    ),
    refereeLine,
    crowdLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function user(i: Input): string {
  const names = new Map(i.generals.map((g) => [g.id, g.name]));
  const scores = i.finalScores
    .map((s) => `${s.name}: ${s.score > 0 ? '+' : ''}${s.score}`)
    .join('\n');
  return `${renderBrief(i.objective, i.brief, i.legend)}

<transcript>
${i.rounds.map((r) => renderRoundFull(names, r)).join('\n\n')}
</transcript>

<final_scores note="per opponent; positive means the player came out ahead">
${scores}
</final_scores>

Write the debrief.`;
}

export const finalReportPrompt: PromptSpec<'final_report'> = { target: 'cloud', system, user };
