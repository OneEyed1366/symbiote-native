import { useEffect, useState } from 'react';
import { addVisibilityListener, getVisibilityAsync } from '../core';
import type { INavigationBarVisibility } from '../core';

/** Statefully tracks the system navigation bar's visibility, `null` during async initialization */
export function useVisibility(): INavigationBarVisibility | null {
  const [visibility, setVisibility] = useState<INavigationBarVisibility | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    getVisibilityAsync().then(value => {
      if (isMounted) setVisibility(value);
    });

    const subscription = addVisibilityListener(({ visibility: next }) => {
      if (isMounted) setVisibility(next);
    });

    return () => {
      subscription.remove();
      isMounted = false;
    };
  }, []);

  return visibility;
}
