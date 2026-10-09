import { useEffect, useState } from 'react';
import {
  createComposedEventHandler,
  type IEventHandlerInternal,
} from '../../core/event-handlers';

// Like `useEvent`, the result is the holder a prop of an animated view takes
export function useComposedEventHandler<Event extends object>(
  handlers: (IEventHandlerInternal<Event> | null)[],
): IEventHandlerInternal<Event> {
  const [composed] = useState(() => createComposedEventHandler<Event>());
  const result = composed.compose(handlers);
  useEffect(() => composed.commit(), [composed, handlers]);
  return result;
}
