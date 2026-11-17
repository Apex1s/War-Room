import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type AI,
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
import type { Mode } from './routing-table';
import { cloudSchema, deviceSchema } from './schemas';

const MODE_MAP: Record<Mode, InferenceMode> = {
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

export function createFirebaseProvider(ai: AI): ModelProvider {
  return {
    kind: 'firebase',
    createModel(params: ProviderModelParams): ProviderModelInstance {
      const model = getGenerativeModel(
        ai,
        {
          mode: MODE_MAP[params.mode],
          inCloudParams: {
            model: params.cloudModel,
            systemInstruction: params.system,
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: cloudSchema(params.task) as SchemaRequest,
              thinkingConfig: {
                thinkingLevel: params.thinkingLevel as ThinkingLevel,
              },
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
              responseConstraint: deviceSchema(params.task),
            },
          },
        },
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
