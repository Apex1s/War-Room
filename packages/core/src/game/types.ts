import type { CrowdPersona, GeneralSpec } from '../../prompts/types';
import type { AiErrorCode, AiResult, Source } from '../ai/router';
import type {
  CrowdOutput,
  CrowdReaction,
  FinalReportOutput,
  GeneralMoveOutput,
  RefereeRoundOutput,
} from '../ai/schemas';
import type { SealResult } from '../firewall/firewall';
import type { PlaceholderEntry } from '../firewall/placeholders';

export type TemplateId = 'startup' | 'price-war' | 'match';

export interface GameTemplate {
  id: TemplateId;
  title: string;
  subtitle: string;
  situation: string;
  objectivePlaceholder: string;
  briefPlaceholder: string;
  openingMove: string;
  generals: GeneralSpec[];
  crowd: CrowdPersona[];
}

export type Phase =
  | { kind: 'draft' }
  | { kind: 'sealing_brief'; progress: number }
  | { kind: 'review' }
  | { kind: 'user_turn'; round: number }
  | { kind: 'sealing_move'; round: number }
  | { kind: 'generals'; round: number; pending: string[] }
  | {
      kind: 'aftermath';
      round: number;
      referee: 'running' | 'done' | 'skipped';
      crowd: 'running' | 'done';
    }
  | { kind: 'reporting' }
  | { kind: 'done' }
  | { kind: 'failed'; at: Phase; code: AiErrorCode };

export interface AiMeta {
  source: Source;
  latencyMs: number;
  model: string;
  fallback: boolean;
}

export interface RoundRecord {
  n: number;
  userMove: string;
  generalMoves: (GeneralMoveOutput & AiMeta & { generalId: string })[];
  crowd: (CrowdReaction & AiMeta)[];
  referee: (RefereeRoundOutput & AiMeta) | null;
}

export interface WhatIfRecord {
  round: number;
  userMove: string;
  crowd: (CrowdReaction & AiMeta)[];
  referee: (RefereeRoundOutput & AiMeta) | null;
  createdAt: number;
}

export interface GameRecord {
  id: string;
  schemaVersion: 1;
  templateId: TemplateId;
  objective: string;
  brief: string;
  redactionMethod: 'on-device-ai' | 'basic';
  generals: GeneralSpec[];
  crowd: CrowdPersona[];
  totalRounds: number;
  rounds: RoundRecord[];
  commitments: string[];
  report: (FinalReportOutput & AiMeta) | null;
  phase: Phase;
  whatIfs: WhatIfRecord[];
  createdAt: number;
  updatedAt: number;
  cloudSavedAt: number | null;
}

export interface VaultRecord {
  gameId: string;
  rawObjective: string;
  rawBrief: string;
  rawMoves: Record<number, string>;
  map: PlaceholderEntry[];
}

export type GameEvent =
  | { type: 'BRIEF_SUBMITTED'; objective: string; brief: string; templateId: TemplateId }
  | { type: 'SEAL_PROGRESS'; progress: number }
  | { type: 'BRIEF_SEALED'; result: SealResult }
  | { type: 'MAP_EDITED'; map: PlaceholderEntry[] }
  | { type: 'REDACTION_APPROVED' }
  | { type: 'MOVE_SUBMITTED'; text: string }
  | { type: 'MOVE_SEALED'; abstracted: string; newEntries: PlaceholderEntry[] }
  | { type: 'GENERAL_MOVED'; generalId: string; result: AiResult<GeneralMoveOutput> }
  | { type: 'CROWD_REACTED'; result: AiResult<CrowdOutput> }
  | { type: 'CROWD_FINISHED' }
  | { type: 'REFEREE_RULED'; result: AiResult<RefereeRoundOutput> }
  | { type: 'NEXT' }
  | { type: 'REPORT_READY'; result: AiResult<FinalReportOutput> }
  | { type: 'FAILED'; code: AiErrorCode }
  | { type: 'RETRY' };
