// Values the native push or pop transition of the current Stack screen drives
// Vue twin of the React hook, the values are stable per route so they come back as they are

import { requireTransitionProgress } from '../../core';
import type { ITransitionProgress } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useTransitionProgress(): ITransitionProgress {
  const scope = requireNavigationScope('useTransitionProgress');
  return requireTransitionProgress(scope.value.transitionProgress);
}
