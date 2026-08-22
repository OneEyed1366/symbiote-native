// React lifecycle wiring over the framework-agnostic core (core/localization.ts /
// core/native-module.ts). Ported from expo-localization's own useLocales hook (sdk-57): a
// useReducer-driven invalidation counter that useMemo recomputes getLocales() from, whenever the
// native module fires onLocaleSettingsChanged.
import { useEffect, useMemo, useReducer } from 'react';
import { addLocaleListener, getLocales, type Locale } from '../../../core';

export function useLocales(): Locale[] {
  const [invalidationKey, invalidate] = useReducer((key: number) => key + 1, 0);
  const locales = useMemo(() => getLocales(), [invalidationKey]);

  useEffect(() => {
    const subscription = addLocaleListener(invalidate);
    return () => subscription.remove();
  }, []);

  return locales;
}
