import type { Task } from './schemas';
import { TASKS } from './tasks';

export type Source = 'on-device' | 'cloud';

export interface AiCallRecord {
  gameId: string | null;
  task: Task;
  source: Source;
  model: string;
  latencyMs: number;
  inChars: number;
  outChars: number;
  fallback: boolean;
  repaired: boolean;
  ts: number;
  cloudPayload?: string;
}

export interface HybridStats {
  totalCalls: number;
  onDeviceCalls: number;
  cloudCalls: number;
  onDeviceSharePercent: number;
  cloudCallsAvoided: number;
  charsKeptLocal: number;
  medianOnDeviceLatencyMs: number;
  medianCloudLatencyMs: number;
}

const records: AiCallRecord[] = [];
const listeners = new Set<() => void>();

export function recordCall(entry: AiCallRecord): void {
  records.push(entry);
  for (const listener of listeners) {
    listener();
  }
}

export function getLedger(gameId?: string): AiCallRecord[] {
  if (gameId === undefined) {
    return [...records];
  }
  return records.filter((r) => r.gameId === gameId);
}

export function clearLedger(): void {
  records.length = 0;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function getHybridStats(gameId?: string, rawBriefChars = 0): HybridStats {
  const list = getLedger(gameId);
  const totalCalls = list.length;
  const onDeviceList = list.filter((r) => r.source === 'on-device');
  const cloudList = list.filter((r) => r.source === 'cloud');

  const onDeviceCalls = onDeviceList.length;
  const cloudCalls = cloudList.length;
  const onDeviceSharePercent =
    totalCalls > 0 ? Math.round((onDeviceCalls / totalCalls) * 100) : 0;

  // On-device calls that had a cloud fallback route (abstracted tasks)
  const cloudCallsAvoided = onDeviceList.filter(
    (r) => TASKS[r.task].privacy === 'abstracted',
  ).length;

  const charsKeptLocal =
    rawBriefChars + onDeviceList.reduce((sum, r) => sum + r.inChars, 0);

  return {
    totalCalls,
    onDeviceCalls,
    cloudCalls,
    onDeviceSharePercent,
    cloudCallsAvoided,
    charsKeptLocal,
    medianOnDeviceLatencyMs: median(onDeviceList.map((r) => r.latencyMs)),
    medianCloudLatencyMs: median(cloudList.map((r) => r.latencyMs)),
  };
}
