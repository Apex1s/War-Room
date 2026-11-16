import { crowdPrompt } from './crowd';
import { finalReportPrompt } from './final-report';
import { generalMovePrompt } from './general-move';
import { redactPrompt } from './redact';
import { refereeLivePrompt } from './referee-live';
import { refereeRoundPrompt } from './referee-round';
import type { PromptSpec, PromptTask } from './types';

/** One prompt per router task. `src/ai/tasks.ts` pairs each with its zod schema and privacy class. */
export const PROMPTS: { [K in PromptTask]: PromptSpec<K> } = {
  redact: redactPrompt,
  crowd: crowdPrompt,
  referee_live: refereeLivePrompt,
  referee_round: refereeRoundPrompt,
  general_move: generalMovePrompt,
  final_report: finalReportPrompt,
};

export { REDACT_EXAMPLE_NAMES } from './redact';
export { repairPrompt } from './repair';
export { LIMITS, clip } from './types';
export type {
  CrowdPersona,
  GeneralSpec,
  PromptInput,
  PromptRound,
  PromptSpec,
  PromptTask,
} from './types';
