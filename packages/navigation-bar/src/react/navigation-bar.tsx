import { useEffect, useMemo, useRef } from 'react';
import { useColorScheme } from '@symbiote-native/react';
import {
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  type INavigationBarProps,
  type INavigationBarStackEntry,
} from '../core';

/** Declaratively configures the navigation bar - several mounted instances merge, last wins */
export function NavigationBar({ style, hidden }: INavigationBarProps): null {
  const colorScheme = useColorScheme();
  const stableProps = useMemo<INavigationBarProps>(
    () => ({ style, hidden }),
    [style, hidden],
  );
  const stackEntryRef = useRef<INavigationBarStackEntry | null>(null);

  useEffect(() => {
    stackEntryRef.current = pushStackEntry(stableProps);
    return () => {
      if (stackEntryRef.current) popStackEntry(stackEntryRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stackEntryRef.current) {
      stackEntryRef.current = replaceStackEntry(
        stackEntryRef.current,
        stableProps,
      );
    }
  }, [colorScheme, stableProps]);

  return null;
}
