// The native transition values of the current Stack screen, needs an injection context
// Core owns the guard, so a call outside a Stack screen throws the same error in every adapter

import {
  requireTransitionProgress,
  type ITransitionProgress,
} from '../../core';
import { requireNavigationContext } from '../navigation-context.service';

export function injectTransitionProgress(): ITransitionProgress {
  return requireTransitionProgress(
    requireNavigationContext('injectTransitionProgress').transitionProgress,
  );
}
