// React lifecycle wiring over the framework-agnostic core — mirrors use-locales' shape exactly.
// Ported from expo-localization's own useCalendars hook (sdk-57).
import { useEffect, useMemo, useReducer } from 'react';
import {
  addCalendarListener,
  getCalendars,
  type Calendar,
} from '../../../core';

export function useCalendars(): Calendar[] {
  const [invalidationKey, invalidate] = useReducer((key: number) => key + 1, 0);
  // invalidationKey is a pure invalidation signal, never read inside the memo — it exists only to
  // force a recompute when the native listener fires, matching upstream's identical pattern.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calendars = useMemo(() => getCalendars(), [invalidationKey]);

  useEffect(() => {
    const subscription = addCalendarListener(invalidate);
    return () => subscription.remove();
  }, []);

  return calendars;
}
