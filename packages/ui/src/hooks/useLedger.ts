import {
  getHybridStats,
  getLedger,
  getNetGuardBlocks,
  subscribeLedger,
  type AiCallRecord,
  type HybridStats,
  type NetGuardBlockRecord,
} from '@warroom/core';
import { useEffect, useState } from 'react';

export interface LedgerHookResult {
  entries: AiCallRecord[];
  cloudEntries: AiCallRecord[];
  stats: HybridStats;
  blockedRequests: NetGuardBlockRecord[];
}

export function useLedger(
  gameId?: string,
  rawBriefChars: number = 0,
): LedgerHookResult {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeLedger(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const entries = getLedger(gameId);
  const cloudEntries = entries.filter((e) => e.source === 'cloud');
  const stats = getHybridStats(gameId, rawBriefChars);
  const blockedRequests = getNetGuardBlocks();

  return {
    entries,
    cloudEntries,
    stats,
    blockedRequests,
  };
}
