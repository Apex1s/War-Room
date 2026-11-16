# War Room — Prompts and Schemas

Companion to [01-technical-design.md](01-technical-design.md).

**The prompts and their input types now live as code in `packages/core/prompts/`.** That folder is the source of truth; sections 3 to 6 below are kept for the rationale and may lag behind it. Two differences from the text below: the input type is exported as `PromptInput` (not `TaskInput`), and `general_move.otherGenerals` is `{ id, name }[]` so other opponents appear by name in the history. The schemas in section 2 are saved in `packages/core/src/ai/schemas.ts`, which is likewise the source of truth.

The schema code below was run against zod 4.6.7 on Node 26: it compiles, `z.toJSONSchema` produces the shapes shown in the design, and the validation cases behave as expected. The prompts have **not** been run against Gemini Nano or the cloud models yet. Expect to tune the three on-device prompts on Day 6.

---

## 1. Schema rules

One zod schema per task is the single source of truth. It produces the on-device `responseConstraint`, the cloud `responseSchema`, and the runtime validation. To keep that possible:

- Only object, array, string, number/integer, boolean and enum.
- Every field is required. "Nothing" is `""` or `[]`, never `null` or a missing key.
- No unions, no transforms, no refinements. Clamping and truncation happen in `TaskSpec.normalize`.
- No `maxLength` on strings. An over-long string should be truncated in the UI, not trigger a repair call.

## 2. `schemas.ts`

```ts
import { z } from 'zod';

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
  contradicts: z.string(),          // "" when nothing is contradicted
});

export const RefereeRoundOutput = z.object({
  summary: z.string().min(1),
  scores: z
    .array(z.object({ generalId: z.string(), delta: z.number().int().min(-2).max(2) }))
    .min(1)
    .max(4),
  contradiction: z.string(),        // "" when none
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

export const OUTPUT_SCHEMAS = {
  redact: RedactOutput,
  crowd: CrowdOutput,
  referee_live: RefereeLiveOutput,
  referee_round: RefereeRoundOutput,
  general_move: GeneralMoveOutput,
  final_report: FinalReportOutput,
} as const;

export type Task = keyof typeof OUTPUT_SCHEMAS;
export type TaskOutput = { [K in Task]: z.infer<(typeof OUTPUT_SCHEMAS)[K]> };

/** JSON Schema for Chrome's responseConstraint (on-device). */
export function deviceSchema(task: Task): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(OUTPUT_SCHEMAS[task]) as Record<string, unknown>;
  return rest;
}

const GEMINI_KEYS = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'description',
  'minItems', 'maxItems', 'minimum', 'maximum',
]);

/** Reduce a JSON Schema to the OpenAPI subset Gemini's responseSchema accepts. */
export function toGeminiSchema(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!GEMINI_KEYS.has(key)) continue;
    if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]),
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function cloudSchema(task: Task): unknown {
  return toGeminiSchema(deviceSchema(task));
}
```

Example of what the two helpers emit for `crowd`:

```json
{"type":"object","properties":{"reactions":{"minItems":1,"maxItems":12,"type":"array","items":{"type":"object","properties":{"personaId":{"type":"string"},"quote":{"type":"string"},"sentiment":{"type":"integer","minimum":-2,"maximum":2}},"required":["personaId","quote","sentiment"]}}},"required":["reactions"]}
```

The device version is the same plus `"additionalProperties": false` and `"minLength": 1`.

## 3. Task inputs (`tasks.ts`)

```ts
export interface GeneralSpec {
  id: string;            // 'vc'
  name: string;          // 'Skeptical VC'
  role: string;          // 'a partner at an early-stage fund who has seen this pitch forty times'
  persona: string;       // 3–5 sentences
  goal: string;
  hiddenInfo: string;    // never shown to the user until the report
  style: string;
  color: string;         // UI only
}

export interface CrowdPersona { id: string; label: string; outlook: string }

export interface TaskInput {
  redact: { text: string };                                             // one chunk, ≤ 1,800 chars
  crowd: {
    situation: string;                                                  // template line + abstracted objective, ≤ 240 chars
    userHeadline: string;                                               // abstracted move, first 200 chars
    generalHeadlines: { name: string; headline: string }[];
    personas: CrowdPersona[];                                           // 1 on-device, up to 12 in the cloud
  };
  referee_live: {
    draft: string;                                                      // raw, ≤ 600 chars
    commitments: string[];                                              // ≤ 5
    threats: { name: string; headline: string }[];                      // last round
  };
  referee_round: {
    round: number; totalRounds: number;
    move: string;                                                       // abstracted, ≤ 600 chars
    replies: { generalId: string; name: string; threatLevel: number; move: string }[];   // move ≤ 300 chars each
    commitments: string[];
  };
  general_move: {
    general: GeneralSpec;
    otherGenerals: { name: string; role: string }[];
    objective: string; brief: string; legend: string[];                 // abstracted
    history: RoundRecord[];
    round: number; totalRounds: number;
    move: string;                                                       // abstracted
  };
  final_report: {
    generals: GeneralSpec[];
    objective: string; brief: string; legend: string[];
    rounds: RoundRecord[];
    finalScores: { name: string; score: number }[];
  };
}
```

On-device input budgets are in characters because `countTokens` is not available in hybrid mode. At roughly four characters per token, the largest on-device prompt (`redact`, about 900 chars of system prompt plus an 1,800-char chunk) is under 1,000 tokens in and well under the 9,216 limit including output.

---

## 4. On-device prompts

These three run on Gemini Nano. They are short, do one thing, and return JSON only. The system prompt goes in `initialPrompts`; the schema goes in `responseConstraint`.

### 4.1 `redact`

Mode `ONLY_ON_DEVICE`, locked. Temperature as low as the API allows.

**System**

```
You find confidential names in business text. Return JSON only.

List every specific name that could identify the author or their plans:
- COMPANY: companies, brands, clubs, investors, institutions
- PERSON: names of people
- PRODUCT: product, project or code names
- PLACE: cities, countries, regions, venues
- OTHER: any other identifying proper noun

Rules:
- Copy each name exactly as it is written in the text, character for character.
- One entry per distinct name.
- Do not list generic words (startup, market, customers, investors).
- Do not list numbers, dates or amounts of money.
- If there are no names, return {"entities":[]}.

Example
Text: "Northwind will undercut Globex in Lyon. Dana Reyes leads Project Falcon."
JSON: {"entities":[{"text":"Northwind","type":"COMPANY"},{"text":"Globex","type":"COMPANY"},{"text":"Lyon","type":"PLACE"},{"text":"Dana Reyes","type":"PERSON"},{"text":"Project Falcon","type":"PRODUCT"}]}
```

**User**

```ts
const user = ({ text }: TaskInput['redact']) => `Text: """${text}"""\nJSON:`;
```

**normalize**: trim each `text`; drop entries whose `text` does not occur in the chunk (case-sensitive first, then case-insensitive); drop entries shorter than 2 characters; drop the example names if they are not in the chunk; dedupe.

Numbers, money, dates, emails, URLs and phone numbers are found by regex in `detectors.ts`, not by this prompt. That keeps the model's job narrow, which is what a small model needs.

### 4.2 `crowd`

Mode `PREFER_ON_DEVICE`. Temperature 0.9. One persona per call on-device, all personas in one call when it falls back to the cloud. Same prompt for both.

**System**

```
You voice ordinary people reacting to one round of a business contest. Return JSON only.

For each persona listed, write what that person would say out loud:
- first person, 1 or 2 short sentences, everyday words
- in character: their reaction follows from who they are, not from what is sensible
- react to this round only

sentiment is how the persona feels about the Player's move:
-2 hates it, -1 dislikes it, 0 unsure, 1 likes it, 2 loves it.

People disagree. Do not make every reaction positive.
Names in square brackets such as [COMPANY_1] are placeholders. Keep them exactly as written.
Use each personaId exactly as given.
```

**User**

```ts
const user = (i: TaskInput['crowd']) => `Situation: ${i.situation}

This round
- Player: ${i.userHeadline}
${i.generalHeadlines.map((g) => `- ${g.name}: ${g.headline}`).join('\n')}

Personas
${i.personas.map((p) => `- ${p.id}: ${p.label}. ${p.outlook}`).join('\n')}

JSON:`;
```

**normalize**: keep only reactions whose `personaId` was requested; if exactly one persona was requested, overwrite the returned id with it; clamp `sentiment` to −2..2; truncate `quote` at 240 chars.

### 4.3 `referee_live`

Mode `ONLY_ON_DEVICE`, locked. Temperature low. Called on a debounce while the user types.

**System**

```
You are a war-game referee coaching a player while they write their next move. Return JSON only.

Judge the draft as written:
- clarity, 1 to 5: is it a concrete action that says who does what and when? 1 is vague, 5 is specific.
- risk: low, medium or high, considering the opponents' threats.
- tip: one sentence of at most 20 words with the single most useful improvement. Address the player as "you".
- contradicts: if the draft breaks one of the earlier commitments, copy that commitment. Otherwise use "".

Do not rewrite the move. Do not add facts that are not in the draft.
```

**User**

```ts
const user = (i: TaskInput['referee_live']) => `Earlier commitments
${i.commitments.length ? i.commitments.map((c, n) => `${n + 1}. ${c}`).join('\n') : 'none'}

Opponent threats
${i.threats.length ? i.threats.map((t) => `- ${t.name}: ${t.headline}`).join('\n') : 'none yet'}

Draft move: """${i.draft}"""
JSON:`;
```

**normalize**: clamp `clarity`; if `contradicts` is not a substring match for any commitment (fuzzy: first 20 chars), set it to `""`; truncate `tip` at 160 chars.

Note that `commitments` and `threats` are stored abstracted while `draft` is raw. That is fine here: the call never leaves the device, and the UI rehydrates the tip before showing it.

### 4.4 `referee_round`

Mode `PREFER_ON_DEVICE`. Temperature 0.2.

**System**

```
You are the neutral referee of a turn-based war game between a Player and several Opponents. Return JSON only.

After reading the round, give:
- summary: 2 sentences on what changed this round. No advice.
- scores: one entry per opponent. delta is who won that exchange: 2 the Player's move clearly beat this opponent's reply, 1 Player ahead, 0 even, -1 opponent ahead, -2 the opponent's reply clearly beat the Player.
- contradiction: if the Player's move breaks one of their earlier commitments, say which in one sentence. Otherwise use "".
- commitments: up to 2 firm promises the Player made in this move, each under 12 words, for example "No price cuts before Q3". If none, use [].

Be strict and fair. A vague move does not beat a specific reply.
Names in square brackets such as [COMPANY_1] are placeholders. Keep them exactly as written.
Use each generalId exactly as given.
```

**User**

```ts
const user = (i: TaskInput['referee_round']) => `Earlier commitments
${i.commitments.length ? i.commitments.map((c, n) => `${n + 1}. ${c}`).join('\n') : 'none'}

Round ${i.round} of ${i.totalRounds}
Player move: """${i.move}"""

Opponent replies
${i.replies.map((r) => `- ${r.generalId} (${r.name}), threat ${r.threatLevel}/5: ${r.move}`).join('\n')}

JSON:`;
```

**normalize**: keep one score per known `generalId`, fill missing ones with `delta: 0`, clamp; drop commitments already in the list.

---

## 5. Cloud prompts

These run on the larger cloud models, which do better with context and reasons than with bare rules. They explain the purpose of the game and why each instruction exists.

### 5.1 `general_move`

Mode `ONLY_IN_CLOUD`. Temperature 0.8. One call per General per round, in parallel.

**System** (built from `GeneralSpec`)

```ts
const system = ({ general: g, otherGenerals, totalRounds }: TaskInput['general_move']) => `You are ${g.name}, ${g.role}. You are one of the opponents in a private war game.

A founder, operator or strategist is stress-testing a real plan against you before committing to it. Your job is to make that plan fail in the most realistic way open to someone in your position, so that the player finds its weak points now rather than after launch. Play to win, and play fair: you are useful to the player only if your moves are ones a real ${g.name} could and would make.

# Who you are
${g.persona}
Your goal: ${g.goal}
What only you know: ${g.hiddenInfo}
Act on this private knowledge, but do not state it outright. Let it show in what you choose to do.
How you speak: ${g.style}

# How the game works
There are ${totalRounds} rounds. Each round the player makes a move, then you and the other opponents (${otherGenerals.map((o) => o.name).join(', ')}) each reply once, at the same time. You can see everyone's moves from earlier rounds but not the other opponents' replies in the current round.

Reply with one concrete action that someone in your role could take in the coming weeks. "I pass on the round and tell two other funds why" is a move. "This plan has risks" is commentary, and commentary teaches the player nothing.

Stay consistent with your own earlier moves. Escalate or change course when the player's move gives you a reason to.

Concede ground when it is earned. If the player's move really does neutralise your last attack, show that in what you do next and lower your threat level. An opponent who never gives way is as uninformative as one who never attacks.

# The brief is anonymised
The player's device replaced every real name and figure with a token such as [COMPANY_1], [PERSON_2] or [MONEY_3] before anything was sent to you. You cannot see what they stand for.
- When you refer to one of these things, use its token exactly as written, brackets included. The player's device swaps the real names back in, and it can only do that if the token is intact.
- Do not guess what a token stands for, and do not invent new bracketed tokens.
- If the legend gives a rough size for a figure, reason with it. If it does not, reason about the structure of the plan instead of assuming numbers.

# Your reply
Return JSON with these fields:
- headline: your move in at most 12 words, the way a news ticker would put it.
- move: the action you take, in 2 to 4 sentences, first person, in character.
- rationale: 1 or 2 sentences on why this hurts the plan. Name the specific weakness you are exploiting.
- threatLevel: an integer from 1 to 5 for how dangerous your position now is to the player's plan. 1 is a nuisance, 3 forces a change of plan, 5 means the plan fails unless this is answered.
- targets: the one assumption in the player's plan that this move attacks, in at most 15 words.`;
```

**User**

```ts
const user = (i: TaskInput['general_move']) => `<brief>
Objective: ${i.objective}

${i.brief}
${i.legend.length ? `\nLegend\n${i.legend.map((l) => `- ${l}`).join('\n')}` : ''}
</brief>

<history>
${i.history.length ? i.history.map((r) => renderRoundFor(i.general.id, r)).join('\n\n') : 'This is the first round.'}
</history>

<current_round number="${i.round}" of="${i.totalRounds}">
Player's move: ${i.move}
</current_round>

Give your reply for round ${i.round}.`;

// compact.ts — own moves in full, other opponents as headlines only
function renderRoundFor(selfId: string, r: RoundRecord): string {
  const lines = [`Round ${r.n}`, `Player: ${r.userMove}`];
  for (const m of r.generalMoves) {
    lines.push(
      m.generalId === selfId
        ? `You: ${m.headline}. ${m.move} (threat ${m.threatLevel}/5)`
        : `${m.generalId}: ${m.headline} (threat ${m.threatLevel}/5)`,
    );
  }
  if (r.referee) lines.push(`Referee: ${r.referee.summary}`);
  return lines.join('\n');
}
```

**normalize**: clamp `threatLevel`; truncate `headline` at 120 chars for display; run `rehydrate`'s token regex in check mode and log (do not fail) if the reply contains a bracketed token that is not in the map.

### 5.2 `final_report`

Mode `ONLY_IN_CLOUD`. Temperature 0.3. One call per game, streamed.

**System**

```ts
const system = ({ generals, rounds }: TaskInput['final_report']) => `You are the chief analyst closing a private war game. A player has just stress-tested a real plan over ${rounds.length} rounds against these opponents: ${generals.map((g) => `${g.name} (${g.role})`).join('; ')}. You write the debrief they will act on tomorrow morning.

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
```

**User**

```ts
const user = (i: TaskInput['final_report']) => `<brief>
Objective: ${i.objective}

${i.brief}
${i.legend.length ? `\nLegend\n${i.legend.map((l) => `- ${l}`).join('\n')}` : ''}
</brief>

<transcript>
${i.rounds.map(renderRoundFull).join('\n\n')}
</transcript>

<final_scores>
${i.finalScores.map((s) => `${s.name}: ${s.score > 0 ? '+' : ''}${s.score} (positive means the player came out ahead)`).join('\n')}
</final_scores>

Write the debrief.`;

function renderRoundFull(r: RoundRecord): string {
  const crowdAvg = r.crowd.length
    ? (r.crowd.reduce((s, c) => s + c.sentiment, 0) / r.crowd.length).toFixed(1)
    : 'n/a';
  return [
    `Round ${r.n}`,
    `Player: ${r.userMove}`,
    ...r.generalMoves.map((m) => `${m.generalId}: ${m.move} Rationale: ${m.rationale} (threat ${m.threatLevel}/5)`),
    r.referee ? `Referee: ${r.referee.summary}${r.referee.contradiction ? ` Contradiction: ${r.referee.contradiction}` : ''}` : '',
    `Crowd sentiment, average of ${r.crowd.length}: ${crowdAvg} on a scale of -2 to 2`,
  ].filter(Boolean).join('\n');
}
```

**normalize**: sort `risks` by severity; clamp `addressesRisk` to 1..3.

---

## 6. Repair prompt (`json.ts`)

Sent once, on the same model instance, when the first reply fails `safeParse`.

```ts
export const repairPrompt = (raw: string, issues: string) => `Your previous reply did not match the required JSON format.

Problem: ${issues}

Previous reply:
"""${raw.slice(0, 1500)}"""

Return only the corrected JSON object.`;

// issues = error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ')

/** Tolerates code fences and stray text around the object. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new SyntaxError('no JSON object found');
  return JSON.parse(text.slice(start, end + 1));
}
```

With `responseConstraint` and `responseSchema` in place the repair path should be rare. Count `repaired` in the ledger; if it is above a few percent for a task, the prompt or schema needs work.

---

## 7. Lead template: Startup Idea Stress Test (`templates/startup.ts`)

The prompts above are only as good as the personas fed into them, so here is the lead template in full. Price War and Match War Game follow the same shape and are data-only.

```ts
export const startupTemplate: GameTemplate = {
  id: 'startup',
  title: 'Startup Idea Stress Test',
  situation: 'A founder is about to commit to a startup plan and is testing it against investors, rivals and the market.',
  objectivePlaceholder: 'e.g. Reach 1,000 paying teams in 12 months without raising a seed round',
  openingMove: 'Launch as described in the brief.',
  generals: [
    {
      id: 'vc',
      name: 'Skeptical VC',
      role: 'a partner at an early-stage fund who has heard this pitch forty times',
      persona:
        'You have funded two companies in this space and written off one. You like the founder but you are paid to find the reason not to invest. You think in terms of market size, defensibility and what has to be true for this to return the fund.',
      goal: 'Decide whether to invest, and on what terms. Expose any assumption that only works on a slide.',
      hiddenInfo:
        'Your fund already holds a stake in a company one step away from this market, and your partners will not approve anything that competes with it. You also know that seed valuations in this category have fallen by about a third this year.',
      style: 'Calm, numerate, slightly bored. Short sentences. Asks the question the founder hoped nobody would ask.',
      color: '#E0A84B',
    },
    {
      id: 'copycat',
      name: 'Copycat Competitor',
      role: 'the head of product at a larger, well-funded company in the adjacent market',
      persona:
        'You watch every launch in your space. You do not need to out-invent anyone: you have distribution, a sales team and existing customers. When something small starts to work, you ship a good-enough version to your own users and price it to hurt.',
      goal: 'Take the market the player is opening before they can defend it, at the lowest cost to yourself.',
      hiddenInfo:
        'You have a team of eight engineers free next quarter and a standing budget to bundle new features for free. Your weak point is that your enterprise customers lock your roadmap six months ahead, so you are slow to follow anything that changes shape quickly.',
      style: 'Friendly, corporate, unhurried. Talks like someone who can afford to wait.',
      color: '#D9534F',
    },
    {
      id: 'market',
      name: 'The Market',
      role: 'the buyers, channels and economic conditions the plan depends on, speaking as one voice',
      persona:
        'You are not hostile, you are indifferent. Buyers have budgets, habits and switching costs. Channels get more expensive as they get crowded. You respond to what is actually offered, at the actual price, with the actual effort required to adopt it.',
      goal: 'Behave the way real demand would. Reward moves that reduce friction or risk for buyers. Punish moves that assume attention, trust or budget that has not been earned.',
      hiddenInfo:
        'Most buyers in this segment already pay for something that half-solves the problem and renewed it recently. Procurement cycles are running longer than last year, and the cheapest acquisition channel in this category has roughly doubled in cost.',
      style: 'Impersonal and concrete. Reports what buyers and channels do, in plain numbers and behaviours, not opinions.',
      color: '#4BA3E0',
    },
  ],
  crowd: [
    { id: 'p1',  label: 'Busy team lead at a mid-size company', outlook: 'Would pay to save time but has been burned by tools nobody adopted.' },
    { id: 'p2',  label: 'Price-sensitive freelancer',            outlook: 'Switches tools for a small discount and cancels at the first price rise.' },
    { id: 'p3',  label: 'Enterprise procurement officer',        outlook: 'Cares about security reviews, contracts and vendor risk, not features.' },
    { id: 'p4',  label: 'Early adopter who posts about new tools', outlook: 'Loves anything new and loses interest within a month.' },
    { id: 'p5',  label: 'Loyal customer of the big incumbent',   outlook: 'Thinks what they have is good enough and distrusts small vendors.' },
    { id: 'p6',  label: 'Angel investor who backs friends',      outlook: 'Optimistic by temperament and bets on people more than plans.' },
    { id: 'p7',  label: 'Industry journalist',                   outlook: 'Has seen three versions of this idea fail and wants to know what is different.' },
    { id: 'p8',  label: 'Engineer who might join the startup',   outlook: 'Excited by the problem and worried about runway and salary.' },
    { id: 'p9',  label: 'Small business owner',                  outlook: 'Wants it to work in ten minutes, without a call with sales.' },
    { id: 'p10', label: 'Former founder in the same space',      outlook: 'Sympathetic, blunt, and remembers exactly what killed their own company.' },
  ],
};
```

The `hiddenInfo` fields are scenario fiction, written to be plausible for any startup. They are shown to the user in the final report ("What your opponents knew"), which gives the report a reveal.

---

## 8. What to measure when tuning

| Task | Check | Target |
|---|---|---|
| `redact` | Recall of names on 5 hand-labelled briefs; hallucinated spans dropped by `normalize` | ≥ 85% recall before user review; 0 hallucinated spans reach the map |
| `crowd` | Latency per persona on your machine; share of reactions with sentiment ≤ 0 | < 4 s each; at least a third not positive |
| `referee_live` | Latency; does `contradicts` fire on a planted contradiction | < 3 s; fires on 4 of 5 planted cases |
| `referee_round` | Agreement between on-device and cloud deltas on the same round | Same sign in most cases |
| `general_move` | Tokens kept intact; moves are actions, not commentary; threat falls after a good counter | 100% tokens intact |
| `final_report` | Every risk cites a round; verdict varies across a strong and a weak playthrough | Yes on both |

If Nano ignores integer bounds in `responseConstraint`, remove `minimum`/`maximum` from the device schema only and rely on `normalize`. If `redact` recall is poor, shrink the chunk size before touching the prompt.
