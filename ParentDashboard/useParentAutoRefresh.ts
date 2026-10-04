import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const DEFAULT_REFRESH_INTERVAL_MS = 15000;

export const useParentAutoRefresh = (intervalMs = DEFAULT_REFRESH_INTERVAL_MS) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const beginRefresh = useCallback(() => {
    if (hasLoadedRef.current) setRefreshing(true);
  }, []);

  const endRefresh = useCallback(() => {
    hasLoadedRef.current = true;
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();

      const intervalId = setInterval(refresh, intervalMs);
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });

      return () => {
        clearInterval(intervalId);
        appStateSubscription.remove();
      };
    }, [intervalMs, refresh]),
  );

  return {
    refreshKey,
    refreshing,
    onRefresh: refresh,
    beginRefresh,
    endRefresh,
    hasLoadedRef,
  };
};
