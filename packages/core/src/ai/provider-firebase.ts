import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type AI,
  type HybridParams,
  type SchemaRequest,
  type ThinkingLevel,
} from 'firebase/ai';
import type {
  ModelProvider,
  ProviderModelInstance,
  ProviderModelParams,
  RawInferenceSource,
  StreamCallOptions,
  StreamCallResult,
} from './provider';
import { registerDeviceAi } from './device';
import type { Mode } from './routing-table';
import {
  cloudSchema,
  crowdCloudSchema,
  crowdDeviceSchema,
  deviceSchema,
  refereeRoundCloudSchema,
  refereeRoundDeviceSchema,
} from './schemas';

const MODE_MAP: Record<Mode, InferenceMode> = {
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

function resolveCloudSchema(params: ProviderModelParams): SchemaRequest {
  if (params.task === 'crowd' && params.schemaIds && params.schemaIds.length > 0) {
    return crowdCloudSchema(params.schemaIds) as SchemaRequest;
  }
  if (params.task === 'referee_round' && params.schemaIds && params.schemaIds.length > 0) {
    return refereeRoundCloudSchema(params.schemaIds) as SchemaRequest;
  }
  return cloudSchema(params.task) as SchemaRequest;
}

function resolveDeviceSchema(params: ProviderModelParams): Record<string, unknown> {
  if (params.task === 'crowd' && params.schemaIds && params.schemaIds.length > 0) {
    return crowdDeviceSchema(params.schemaIds);
  }
  if (params.task === 'referee_round' && params.schemaIds && params.schemaIds.length > 0) {
    return refereeRoundDeviceSchema(params.schemaIds);
  }
  return deviceSchema(params.task);
}

export function buildFirebaseModelParams(params: ProviderModelParams): HybridParams {
  return {
    mode: MODE_MAP[params.mode],
    inCloudParams: {
      model: params.cloudModel,
      systemInstruction: params.system,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: resolveCloudSchema(params),
        ...(params.thinkingLevel !== undefined
          ? {
              thinkingConfig: {
                thinkingLevel: params.thinkingLevel as ThinkingLevel,
              },
            }
          : {}),
        ...(params.maxOutputTokens !== undefined
          ? { maxOutputTokens: params.maxOutputTokens }
          : {}),
      },
    },
    onDeviceParams: {
      createOptions: {
        initialPrompts: [
          {
            role: 'system',
            content: [{ type: 'text', value: params.system }],
          },
        ],
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: {
        responseConstraint: resolveDeviceSchema(params),
      },
    },
  };
}

export function createFirebaseProvider(ai: AI): ModelProvider {
  registerDeviceAi(ai);
  return {
    kind: 'firebase',
    createModel(params: ProviderModelParams): ProviderModelInstance {
      const model = getGenerativeModel(
        ai,
        buildFirebaseModelParams(params),
        { timeout: params.timeoutMs },
      );

      return {
        async generateStream(
          userPrompt: string,
          opts?: StreamCallOptions,
        ): Promise<StreamCallResult> {
          const streamResult = await model.generateContentStream(userPrompt, {
            signal: opts?.signal,
            timeout: params.timeoutMs,
          });
          // Attach a no-op rejection handler before iterating the stream so a mid-stream
          // error does not also surface as an unhandled promise rejection on streamResult.response.
          void streamResult.response.catch(() => {});

          let accumulated = '';
          for await (const chunk of streamResult.stream) {
            const piece = chunk.text();
            if (piece) {
              accumulated += piece;
              opts?.onText?.(accumulated);
            }
          }

          const finalResponse = await streamResult.response;
          const finalText = finalResponse.text() || accumulated;
          const inferenceSource: RawInferenceSource =
            finalResponse.inferenceSource === InferenceSource.ON_DEVICE
              ? 'on_device'
              : 'in_cloud';

          return {
            text: finalText,
            inferenceSource,
          };
        },
      };
    },
  };
}
