// React lifecycle wiring over the framework-agnostic core (core/localization.ts /
// core/native-module.ts). Ported from expo-localization's own useLocales hook (sdk-57): a
// useReducer-driven invalidation counter that useMemo recomputes getLocales() from, whenever the
// native module fires onLocaleSettingsChanged.
import { useEffect, useMemo, useReducer } from 'react';
import { addLocaleListener, getLocales, type Locale } from '../../../core';

export function useLocales(): Locale[] {
  const [invalidationKey, invalidate] = useReducer((key: number) => key + 1, 0);
  // invalidationKey is a pure invalidation signal, never read inside the memo — it exists only to
  // force a recompute when the native listener fires, matching upstream's identical pattern.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locales = useMemo(() => getLocales(), [invalidationKey]);

  useEffect(() => {
    const subscription = addLocaleListener(invalidate);
    return () => subscription.remove();
  }, []);

  return locales;
}
