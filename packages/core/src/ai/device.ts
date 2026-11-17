import {
  getGenerativeModel,
  InferenceMode,
  type AI,
  type LanguageModelCreateCoreOptions,
} from 'firebase/ai';

export type DeviceAvailabilityStatus =
  | 'unknown'
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available';

export interface DeviceState {
  status: DeviceAvailabilityStatus;
  progress: number;
}

interface ChromeLanguageModelGlobal {
  availability(options?: LanguageModelCreateCoreOptions): Promise<string>;
}

let currentState: DeviceState = {
  status: 'unknown',
  progress: 0,
};

const listeners = new Set<(state: DeviceState) => void>();

function notify(): void {
  const snapshot = { ...currentState };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getDeviceState(): DeviceState {
  return { ...currentState };
}

export function subscribeDeviceState(
  listener: (state: DeviceState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDeviceStatusForTest(
  status: DeviceAvailabilityStatus,
  progress = status === 'available' ? 1 : 0,
): void {
  currentState = { status, progress };
  notify();
}

export function getGlobalLanguageModel(): ChromeLanguageModelGlobal | undefined {
  return (globalThis as { LanguageModel?: ChromeLanguageModelGlobal }).LanguageModel;
}

/**
 * Synchronous check used by the router's privacy lock before building any model:
 * returns true only when `globalThis.LanguageModel` exists AND `device.status === 'available'`.
 */
export function isDeviceReadyForOnlyOnDevice(): boolean {
  return getGlobalLanguageModel() !== undefined && currentState.status === 'available';
}

export async function refreshDeviceAvailability(): Promise<DeviceAvailabilityStatus> {
  const lm = getGlobalLanguageModel();
  if (!lm) {
    currentState = { status: 'unavailable', progress: 0 };
    notify();
    return 'unavailable';
  }

  try {
    const raw = await lm.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    const status: DeviceAvailabilityStatus =
      raw === 'available' ||
      raw === 'downloadable' ||
      raw === 'downloading' ||
      raw === 'unavailable'
        ? raw
        : 'unavailable';
    currentState = {
      status,
      progress: status === 'available' ? 1 : currentState.progress,
    };
    notify();
    return status;
  } catch {
    currentState = { status: 'unavailable', progress: 0 };
    notify();
    return 'unavailable';
  }
}

/**
 * Triggers on-device model download via the Firebase AI Logic SDK.
 * Must be called from a user gesture.
 */
export async function downloadDeviceModel(
  ai: AI,
  onProgress?: (progress: number) => void,
): Promise<DeviceAvailabilityStatus> {
  if (!getGlobalLanguageModel()) {
    currentState = { status: 'unavailable', progress: 0 };
    notify();
    return 'unavailable';
  }

  currentState = { status: 'downloading', progress: 0 };
  notify();

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
    },
  });

  try {
    await model.initializeDeviceModel((progressValue: number) => {
      currentState = { status: 'downloading', progress: progressValue };
      notify();
      onProgress?.(progressValue);
    });
    return await refreshDeviceAvailability();
  } catch {
    currentState = { status: 'unavailable', progress: 0 };
    notify();
    return 'unavailable';
  }
}
