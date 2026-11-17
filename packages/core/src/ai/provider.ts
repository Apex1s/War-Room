import type { Mode, ThinkingLevelValue } from './routing-table';
import type { Task } from './schemas';

export type RawInferenceSource = 'on_device' | 'in_cloud';

export interface ProviderModelParams {
  task: Task;
  mode: Mode;
  cloudModel: string;
  thinkingLevel: ThinkingLevelValue;
  timeoutMs: number;
  maxOutputTokens?: number;
  system: string;
}

export interface StreamCallOptions {
  signal?: AbortSignal;
  onText?: (partial: string) => void;
}

export interface StreamCallResult {
  text: string;
  inferenceSource: RawInferenceSource;
}

export interface ProviderModelInstance {
  generateStream(
    userPrompt: string,
    opts?: StreamCallOptions,
  ): Promise<StreamCallResult>;
}

export interface ModelProvider {
  readonly kind: 'firebase' | 'mock';
  createModel(params: ProviderModelParams): ProviderModelInstance;
}
