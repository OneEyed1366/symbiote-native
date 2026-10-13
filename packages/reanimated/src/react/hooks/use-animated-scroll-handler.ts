import { createUseAnimatedScrollHandler } from '../../core/scroll-handler-hook';
import { useEvent } from './use-event';
import { useHandler } from './use-handler';

export const useAnimatedScrollHandler = createUseAnimatedScrollHandler(
  useHandler,
  useEvent,
);
