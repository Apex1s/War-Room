import { z } from 'zod';
import type { Task } from './schemas';

export type Mode = 'only_on_device' | 'prefer_on_device' | 'prefer_in_cloud' | 'only_in_cloud';
export type ThinkingLevelValue = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export const ModeSchema = z.enum([
  'only_on_device',
  'prefer_on_device',
  'prefer_in_cloud',
  'only_in_cloud',
]);

export const ThinkingLevelSchema = z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);

export const TaskRouteSchema = z.object({
  mode: ModeSchema,
  cloudModel: z.string().min(1),
  fallbackModel: z.string().min(1),
  deviceLastResort: z.boolean(),
  thinkingLevel: ThinkingLevelSchema.optional(),
  timeoutMs: z.number().int().min(1000).max(180000),
  maxOutputTokens: z.number().int().min(64).max(8192).optional(),
});

export type TaskRoute = z.infer<typeof TaskRouteSchema>;

export const ConfigurableTaskSchema = z.enum([
  'crowd',
  'referee_round',
  'general_move',
  'final_report',
]);

export type ConfigurableTask = z.infer<typeof ConfigurableTaskSchema>;

export const RoutingTableSchema = z.object({
  v: z.literal(1),
  rounds: z.number().int().min(1).max(10),
  tasks: z.object({
    crowd: TaskRouteSchema,
    referee_round: TaskRouteSchema,
    general_move: TaskRouteSchema,
    final_report: TaskRouteSchema,
  }),
  crowd: z.object({
    personas: z.number().int().min(1).max(12),
    perRound: z.number().int().min(1).max(12).default(5),
    batchOnDevice: z.number().int().min(1).max(12),
    batchInCloud: z.number().int().min(1).max(12),
  }),
});

export type RoutingTable = z.infer<typeof RoutingTableSchema>;

export const DEFAULT_ROUTING_TABLE: RoutingTable = {
  v: 1,
  rounds: 3,
  tasks: {
    crowd: {
      mode: 'prefer_on_device',
      cloudModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.8-flash',
      deviceLastResort: false,
      timeoutMs: 20000,
    },
    referee_round: {
      mode: 'prefer_on_device',
      cloudModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.8-flash',
      deviceLastResort: false,
      timeoutMs: 20000,
    },
    general_move: {
      mode: 'only_in_cloud',
      cloudModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.8-flash',
      deviceLastResort: true,
      timeoutMs: 25000,
    },
    final_report: {
      mode: 'only_in_cloud',
      cloudModel: 'gemini-4-hydrogen',
      fallbackModel: 'gemini-3.5-flash-lite',
      deviceLastResort: false,
      thinkingLevel: 'LOW',
      timeoutMs: 90000,
    },
  },
  crowd: {
    personas: 10,
    perRound: 5,
    batchOnDevice: 5,
    batchInCloud: 5,
  },
};

const RAW_TASK_ROUTE: TaskRoute = {
  mode: 'only_on_device',
  cloudModel: 'none',
  fallbackModel: 'none',
  deviceLastResort: false,
  timeoutMs: 20000,
};

export interface UrlOverrides {
  forceCloud: boolean;
  forceDevice: boolean;
  mock: boolean;
}

let activeRoutingTable: RoutingTable = DEFAULT_ROUTING_TABLE;
let manualUrlOverrides: Partial<UrlOverrides> | null = null;
const tableListeners = new Set<() => void>();

/** Parse the `routing_table` JSON string from Remote Config; invalid or missing falls back to compiled defaults. */
export function parseRoutingTable(jsonString: string | null | undefined): RoutingTable {
  if (!jsonString) return DEFAULT_ROUTING_TABLE;
  try {
    const raw: unknown = JSON.parse(jsonString);
    const parsed = RoutingTableSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_ROUTING_TABLE;
  } catch {
    return DEFAULT_ROUTING_TABLE;
  }
}

export function getRoutingTable(): RoutingTable {
  return activeRoutingTable;
}

export function setRoutingTable(table: RoutingTable): void {
  activeRoutingTable = table;
  for (const listener of tableListeners) {
    listener();
  }
}

export function updateRoutingTableFromJson(jsonString: string | null | undefined): RoutingTable {
  const next = parseRoutingTable(jsonString);
  setRoutingTable(next);
  return next;
}

export function onRoutingTableChange(listener: () => void): () => void {
  tableListeners.add(listener);
  return () => {
    tableListeners.delete(listener);
  };
}

export function parseUrlOverrides(search?: string): UrlOverrides {
  const rawSearch =
    search ??
    (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  const params = new URLSearchParams(rawSearch);
  return {
    forceCloud: manualUrlOverrides?.forceCloud ?? params.get('forceCloud') === '1',
    forceDevice: manualUrlOverrides?.forceDevice ?? params.get('forceDevice') === '1',
    mock: manualUrlOverrides?.mock ?? params.get('mock') === '1',
  };
}

export function setUrlOverridesForTest(overrides: Partial<UrlOverrides> | null): void {
  manualUrlOverrides = overrides;
  for (const listener of tableListeners) {
    listener();
  }
}

/**
 * Resolve the route for a task:
 * Remote Config table -> URL override -> privacy clamp (applied by caller/here).
 */
export function resolveTaskRoute(
  task: Task,
  privacy: 'raw' | 'abstracted',
  table: RoutingTable = activeRoutingTable,
  overrides: UrlOverrides = parseUrlOverrides(),
): TaskRoute {
  if (privacy === 'raw' || task === 'redact' || task === 'referee_live') {
    // PRIVACY LOCK: raw tasks are forced to only_on_device in code.
    return { ...RAW_TASK_ROUTE, mode: 'only_on_device' };
  }

  const base = { ...table.tasks[task] };

  if (overrides.forceCloud) {
    base.mode = 'only_in_cloud';
  } else if (overrides.forceDevice) {
    if (task === 'crowd' || task === 'referee_round') {
      base.mode = 'only_on_device';
    }
  }

  return base;
}
