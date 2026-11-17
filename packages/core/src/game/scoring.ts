import type { GeneralSpec } from '../../prompts/types';
import type { RoundRecord } from './types';

export interface GeneralScoreSummary {
  generalId: string;
  name: string;
  score: number;
  latestThreatLevel: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Score per General is the running sum of the referee's `delta` across rounds,
 * clamped to -6..+6 over a 3-round game. `threatLevel` comes from the General's
 * latest move and is reported separately.
 */
export function computeGeneralScores(
  generals: GeneralSpec[],
  rounds: RoundRecord[],
): GeneralScoreSummary[] {
  return generals.map((g) => {
    let rawSum = 0;
    let latestThreatLevel = 0;

    for (const r of rounds) {
      const gm = r.generalMoves.find((m) => m.generalId === g.id);
      if (gm) {
        latestThreatLevel = gm.threatLevel;
      }
      if (r.referee) {
        const deltaEntry = r.referee.scores.find((s) => s.generalId === g.id);
        if (deltaEntry) {
          rawSum += deltaEntry.delta;
        }
      }
    }

    return {
      generalId: g.id,
      name: g.name,
      score: clamp(rawSum, -6, 6),
      latestThreatLevel,
    };
  });
}

export function computeCrowdSentimentAverage(
  crowd: { sentiment: number }[],
): number | null {
  if (crowd.length === 0) return null;
  const total = crowd.reduce((sum, c) => sum + c.sentiment, 0);
  return Math.round((total / crowd.length) * 10) / 10;
}
