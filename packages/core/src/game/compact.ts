import type { CrowdPersona, GeneralSpec, PromptInput, PromptRound } from '../../prompts/types';
import { applyMap, type PlaceholderEntry } from '../firewall/placeholders';
import { computeGeneralScores } from './scoring';
import { TEMPLATES } from './templates';
import type { GameRecord, RoundRecord } from './types';

/**
 * Pass every string placed into an AI prompt through `applyMap(text, vaultMap)`
 * so that even if an earlier General reply or user text contained an unmasked term
 * or number from the vault, the egress guard never triggers a false hit.
 */
export function sanitizePromptText(
  text: string,
  vaultMap: PlaceholderEntry[],
): string {
  if (!text || vaultMap.length === 0) return text;
  return applyMap(text, vaultMap);
}

/**
 * Compact past rounds for a specific General:
 * - Own past moves are kept in full (`headline`, `move`, `rationale`)
 * - Other Generals' past moves keep `headline` only
 * - Every string is passed through `applyMap(text, vaultMap)`
 */
export function compactHistoryForGeneral(
  selfGeneralId: string,
  rounds: RoundRecord[],
  vaultMap: PlaceholderEntry[],
): PromptRound[] {
  return rounds.map((r) => ({
    n: r.n,
    userMove: sanitizePromptText(r.userMove, vaultMap),
    generalMoves: r.generalMoves.map((m) => {
      const isSelf = m.generalId === selfGeneralId;
      return {
        generalId: m.generalId,
        headline: sanitizePromptText(m.headline, vaultMap),
        move: isSelf ? sanitizePromptText(m.move, vaultMap) : '',
        rationale: isSelf ? sanitizePromptText(m.rationale, vaultMap) : '',
        threatLevel: m.threatLevel,
      };
    }),
    crowd: r.crowd.map((c) => ({ sentiment: c.sentiment })),
    referee: r.referee
      ? {
          summary: sanitizePromptText(r.referee.summary, vaultMap),
          contradiction: sanitizePromptText(r.referee.contradiction, vaultMap),
        }
      : null,
  }));
}

/**
 * Full round history for `final_report`, with every string sanitised against `vaultMap`.
 */
export function compactHistoryFull(
  rounds: RoundRecord[],
  vaultMap: PlaceholderEntry[],
): PromptRound[] {
  return rounds.map((r) => ({
    n: r.n,
    userMove: sanitizePromptText(r.userMove, vaultMap),
    generalMoves: r.generalMoves.map((m) => ({
      generalId: m.generalId,
      headline: sanitizePromptText(m.headline, vaultMap),
      move: sanitizePromptText(m.move, vaultMap),
      rationale: sanitizePromptText(m.rationale, vaultMap),
      threatLevel: m.threatLevel,
    })),
    crowd: r.crowd.map((c) => ({ sentiment: c.sentiment })),
    referee: r.referee
      ? {
          summary: sanitizePromptText(r.referee.summary, vaultMap),
          contradiction: sanitizePromptText(r.referee.contradiction, vaultMap),
        }
      : null,
  }));
}

export function buildGeneralMoveInput(
  game: GameRecord,
  general: GeneralSpec,
  roundNumber: number,
  currentMove: string,
  vaultMap: PlaceholderEntry[],
  legend: string[] = [],
): PromptInput['general_move'] {
  const priorRounds = game.rounds.filter((r) => r.n < roundNumber);
  const otherGenerals = game.generals
    .filter((g) => g.id !== general.id)
    .map((g) => ({ id: g.id, name: g.name }));

  const sanitizedGeneral: GeneralSpec = {
    ...general,
    role: sanitizePromptText(general.role, vaultMap),
    persona: sanitizePromptText(general.persona, vaultMap),
    goal: sanitizePromptText(general.goal, vaultMap),
    hiddenInfo: sanitizePromptText(general.hiddenInfo, vaultMap),
    style: sanitizePromptText(general.style, vaultMap),
  };

  return {
    general: sanitizedGeneral,
    otherGenerals,
    objective: sanitizePromptText(game.objective, vaultMap),
    brief: sanitizePromptText(game.brief, vaultMap),
    legend: legend.map((l) => sanitizePromptText(l, vaultMap)),
    history: compactHistoryForGeneral(general.id, priorRounds, vaultMap),
    round: roundNumber,
    totalRounds: game.totalRounds,
    move: sanitizePromptText(currentMove, vaultMap),
  };
}

export function buildCrowdInput(
  game: GameRecord,
  roundRecord: RoundRecord,
  personas: CrowdPersona[],
  vaultMap: PlaceholderEntry[],
): PromptInput['crowd'] {
  const tpl = TEMPLATES[game.templateId];
  const generalNames = new Map(game.generals.map((g) => [g.id, g.name]));
  const situation = `${tpl.situation} Objective: ${sanitizePromptText(game.objective, vaultMap)}`;

  return {
    situation: sanitizePromptText(situation, vaultMap),
    userHeadline: sanitizePromptText(roundRecord.userMove, vaultMap),
    generalHeadlines: roundRecord.generalMoves.map((m) => ({
      name: generalNames.get(m.generalId) ?? m.generalId,
      headline: sanitizePromptText(m.headline, vaultMap),
    })),
    personas,
  };
}

export function buildRefereeRoundInput(
  game: GameRecord,
  roundRecord: RoundRecord,
  vaultMap: PlaceholderEntry[],
): PromptInput['referee_round'] {
  const generalNames = new Map(game.generals.map((g) => [g.id, g.name]));

  return {
    round: roundRecord.n,
    totalRounds: game.totalRounds,
    move: sanitizePromptText(roundRecord.userMove, vaultMap),
    replies: roundRecord.generalMoves.map((m) => ({
      generalId: m.generalId,
      name: generalNames.get(m.generalId) ?? m.generalId,
      threatLevel: m.threatLevel,
      move: sanitizePromptText(m.move, vaultMap),
    })),
    commitments: game.commitments.map((c) => sanitizePromptText(c, vaultMap)),
  };
}

export function buildFinalReportInput(
  game: GameRecord,
  vaultMap: PlaceholderEntry[],
  legend: string[] = [],
): PromptInput['final_report'] {
  const scores = computeGeneralScores(game.generals, game.rounds);

  return {
    generals: game.generals,
    objective: sanitizePromptText(game.objective, vaultMap),
    brief: sanitizePromptText(game.brief, vaultMap),
    legend: legend.map((l) => sanitizePromptText(l, vaultMap)),
    rounds: compactHistoryFull(game.rounds, vaultMap),
    finalScores: scores.map((s) => ({ name: s.name, score: s.score })),
  };
}
