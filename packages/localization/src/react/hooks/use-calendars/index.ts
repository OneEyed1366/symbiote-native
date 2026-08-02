// React lifecycle wiring over the framework-agnostic core — mirrors use-locales' shape exactly.
// Ported from expo-localization's own useCalendars hook (sdk-57).
import { useEffect, useMemo, useReducer } from 'react';
import { addCalendarListener, getCalendars, type Calendar } from '../../../core';

export function useCalendars(): Calendar[] {
  const [invalidationKey, invalidate] = useReducer((key: number) => key + 1, 0);
  const calendars = useMemo(() => getCalendars(), [invalidationKey]);

  useEffect(() => {
    const subscription = addCalendarListener(invalidate);
    return () => subscription.remove();
  }, []);

  return calendars;
}
