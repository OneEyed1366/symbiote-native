// Values the native push or pop transition of the current Stack screen drives
// Same role as `useTransitionProgress` of the screens library, outside a Stack screen it throws

import { requireTransitionProgress } from '../../core';
import type { ITransitionProgress } from '../../core';
import { useRequiredNavigationContext } from '../navigation-context';

export function useTransitionProgress(): ITransitionProgress {
  const context = useRequiredNavigationContext('useTransitionProgress');
  return requireTransitionProgress(context.transitionProgress);
}
