import {
  getDeviceState,
  refreshDeviceAvailability,
  subscribeDeviceState,
  type DeviceState,
} from '@warroom/core';
import { useCallback, useEffect, useState } from 'react';

export function useDeviceStatus(onDownloadModel?: () => Promise<unknown>) {
  const [state, setState] = useState<DeviceState>(() => getDeviceState());

  useEffect(() => {
    const unsubscribe = subscribeDeviceState(setState);
    void refreshDeviceAvailability();
    return unsubscribe;
  }, []);

  const triggerDownload = useCallback(async () => {
    if (!onDownloadModel) return;
    await onDownloadModel();
  }, [onDownloadModel]);

  const recheck = useCallback(async () => {
    await refreshDeviceAvailability();
  }, []);

  return {
    ...state,
    triggerDownload,
    recheck,
  };
}
