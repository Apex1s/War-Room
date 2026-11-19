import { detectCapitalisedRuns } from '../firewall/detectors';
import type {
  ModelProvider,
  ProviderModelInstance,
  ProviderModelParams,
  RawInferenceSource,
  StreamCallOptions,
  StreamCallResult,
} from './provider';
import type { Task, TaskOutput } from './schemas';

export const CANNED_OUTPUTS: { [K in Task]: TaskOutput[K] } = {
  redact: {
    entities: [
      { text: 'Acme', type: 'COMPANY' },
      { text: 'Casablanca', type: 'PLACE' },
    ],
  },
  crowd: {
    reactions: [
      {
        personaId: 'p1',
        quote: 'I would try a self-serve workflow tool if setup takes under ten minutes.',
        sentiment: 1,
      },
    ],
  },
  referee_live: {
    clarity: 4,
    risk: 'medium',
    tip: 'Name the exact segment and timeframe for the self-serve rollout.',
    contradicts: '',
  },
  referee_round: {
    summary:
      'The player launched a self-serve tier while opponents attacked distribution and switching costs.',
    scores: [
      { generalId: 'vc', delta: 0 },
      { generalId: 'copycat', delta: -1 },
      { generalId: 'market', delta: 1 },
    ],
    contradiction: '',
    commitments: ['Keep self-serve onboarding under 14 days'],
  },
  general_move: {
    headline: 'Pass on seed round and back a vertical rival with lower CAC',
    move: 'I pass on [COMPANY_1] and lead a seed round in a vertical competitor focused on regulated teams. I share our diligence memo with two co-investors.',
    rationale: 'Horizontal self-serve at [MONEY_2] per seat cannot cover rising acquisition costs.',
    threatLevel: 3,
    targets: 'Self-serve customer acquisition cost stays low without a sales team',
  },
  final_report: {
    verdict: 'holds_with_changes',
    verdictLine:
      '[COMPANY_1] can reach its target only if it narrows its wedge before [COMPANY_2] bundles a free clone.',
    summary:
      'Across three rounds, [COMPANY_1] defended its self-serve onboarding well against The Market, but Copycat Competitor undercut pricing on general seats. Skeptical VC exposed the payback period assumption at [MONEY_2] per seat.',
    risks: [
      {
        title: 'Incumbent bundling erodes horizontal self-serve conversion',
        detail:
          'Copycat Competitor shipped a bundled version to existing enterprise seats (R1, Copycat Competitor).',
        severity: 'high',
        raisedBy: 'Copycat Competitor',
      },
      {
        title: 'Acquisition channel cost doubles before payback',
        detail:
          'The Market reported that paid acquisition in this category doubled in cost over the past year (R2, The Market).',
        severity: 'medium',
        raisedBy: 'The Market',
      },
      {
        title: 'Seed investors pass due to portfolio conflict',
        detail:
          'Skeptical VC passed and backed an adjacent vertical rival (R1, Skeptical VC).',
        severity: 'low',
        raisedBy: 'Skeptical VC',
      },
    ],
    counterStrategies: [
      {
        title: 'Lock in multi-system audit integrations incumbents cannot bundle',
        detail:
          'Ship cross-vendor connectors in the next 30 days so the incumbent bundle cannot replace [PRODUCT_1].',
        addressesRisk: 1,
      },
      {
        title: 'Shift acquisition to partner-led audit templates',
        detail:
          'Distribute free compliance checklists through existing ops communities instead of paid search.',
        addressesRisk: 2,
      },
      {
        title: 'Fund growth from annual pre-paid team plans',
        detail:
          'Offer a two-month discount on annual team plans to eliminate reliance on seed financing.',
        addressesRisk: 3,
      },
    ],
    nextSteps: [
      'Interview all 18 design partners this week to rank cross-vendor integrations.',
      'Publish the self-serve tier with an annual pre-pay incentive within 14 days.',
      'Measure 30-day cohort retention before spending on paid channels.',
    ],
    confidence: 'high',
  },
};

export interface MockCallLog {
  params: ProviderModelParams;
  userPrompt: string;
}

export type MockHandler = (
  params: ProviderModelParams,
  userPrompt: string,
  callIndex: number,
  opts?: StreamCallOptions,
) => Promise<StreamCallResult> | StreamCallResult;

export interface MockProviderController extends ModelProvider {
  readonly calls: MockCallLog[];
  readonly createdModels: ProviderModelParams[];
  setHandler(handler: MockHandler | null): void;
  enqueueResponses(responses: (string | StreamCallResult | Error)[]): void;
  reset(): void;
}

function buildDefaultMockOutput(
  params: ProviderModelParams,
  userPrompt: string,
): unknown {
  if (params.task === 'redact') {
    const heuristicNames = detectCapitalisedRuns(userPrompt).map((e) => ({
      text: e.text,
      type: e.type as 'COMPANY' | 'PERSON' | 'PRODUCT' | 'PLACE' | 'OTHER',
    }));
    return {
      entities: [...CANNED_OUTPUTS.redact.entities, ...heuristicNames].slice(0, 40),
    };
  }

  if (params.task === 'crowd' && params.schemaIds && params.schemaIds.length > 1) {
    const sampleQuotes = [
      'I would try a self-serve workflow tool if setup takes under ten minutes.',
      'Unless it plugs into our existing stack on day one, my team will ignore it.',
      'Transparent per-seat pricing beats sitting through three discovery calls.',
      'If our incumbent bundles an 80% clone for free, procurement will freeze new spend.',
      'A 14-day trial is enough for us to verify whether the audit alerts are real.',
    ];
    const sampleSentiments = [1, -1, 2, -2, 1];
    return {
      reactions: params.schemaIds.map((personaId, idx) => ({
        personaId,
        quote: sampleQuotes[idx % sampleQuotes.length]!,
        sentiment: sampleSentiments[idx % sampleSentiments.length]!,
      })),
    };
  }

  if (params.task === 'referee_round' && params.schemaIds && params.schemaIds.length > 0) {
    const base = CANNED_OUTPUTS.referee_round;
    const defaultDeltas = [0, -1, 1, 0];
    return {
      ...base,
      scores: params.schemaIds.map((generalId, idx) => ({
        generalId,
        delta: defaultDeltas[idx % defaultDeltas.length]!,
      })),
    };
  }

  void userPrompt;
  return CANNED_OUTPUTS[params.task];
}
function defaultInferenceSource(mode: ProviderModelParams['mode']): RawInferenceSource {
  return mode === 'only_on_device' || mode === 'prefer_on_device'
    ? 'on_device'
    : 'in_cloud';
}

export function createMockProvider(): MockProviderController {
  const calls: MockCallLog[] = [];
  const createdModels: ProviderModelParams[] = [];
  let customHandler: MockHandler | null = null;
  const queuedResponses: (string | StreamCallResult | Error)[] = [];

  return {
    kind: 'mock',
    calls,
    createdModels,
    setHandler(handler: MockHandler | null): void {
      customHandler = handler;
    },
    enqueueResponses(responses: (string | StreamCallResult | Error)[]): void {
      queuedResponses.push(...responses);
    },
    reset(): void {
      calls.length = 0;
      createdModels.length = 0;
      customHandler = null;
      queuedResponses.length = 0;
    },
    createModel(params: ProviderModelParams): ProviderModelInstance {
      createdModels.push(params);
      let callIndex = 0;

      return {
        async generateStream(
          userPrompt: string,
          opts?: StreamCallOptions,
        ): Promise<StreamCallResult> {
          if (opts?.signal?.aborted) {
            const abortErr = new Error('The operation was aborted.');
            abortErr.name = 'AbortError';
            throw abortErr;
          }

          calls.push({ params, userPrompt });
          const currentCallIndex = callIndex++;

          if (customHandler) {
            const res = await customHandler(params, userPrompt, currentCallIndex, opts);
            if (opts?.signal?.aborted) {
              const abortErr = new Error('The operation was aborted.');
              abortErr.name = 'AbortError';
              throw abortErr;
            }
            if (res.text) {
              opts?.onText?.(res.text);
            }
            return res;
          }

          if (queuedResponses.length > 0) {
            const next = queuedResponses.shift()!;
            if (next instanceof Error) {
              throw next;
            }
            if (typeof next === 'string') {
              opts?.onText?.(next);
              return {
                text: next,
                inferenceSource: defaultInferenceSource(params.mode),
              };
            }
            if (next.text) {
              opts?.onText?.(next.text);
            }
            return next;
          }

          const canned = buildDefaultMockOutput(params, userPrompt);
          const text = JSON.stringify(canned);
          opts?.onText?.(text);
          return {
            text,
            inferenceSource: defaultInferenceSource(params.mode),
          };
        },
      };
    },
  };
}

export const defaultMockProvider = createMockProvider();
