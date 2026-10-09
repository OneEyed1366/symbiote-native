import { useEffect, useState } from 'react';
import { logger } from 'react-native-reanimated/src/common';
import type { UnknownRecord } from 'react-native-reanimated/src/common';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import type {
  GeneralHandlers,
  UseHandlerContext,
} from 'react-native-reanimated/src/hook/useHandlerCommon';
import {
  createHandlerState,
  isWorkletHandlers,
} from '../../core/event-handlers';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

export function useHandler<Event extends object, Context extends UnknownRecord>(
  handlers: GeneralHandlers<Event, Context>,
  dependencies?: DependencyList,
): UseHandlerContext<Context> {
  if (__DEV__ && dependencies !== undefined) {
    logger.warnOnce(DEPENDENCIES_WARNING, 1);
  }
  const [state] = useState(() => createHandlerState<Context>());
  const observation = state.observe(handlers);
  // Written after the commit, so an interrupted render leaves the previous handlers standing
  useEffect(() => {
    if (isWorkletHandlers(handlers)) state.commit(handlers);
  }, [state, handlers]);
  return observation;
}
