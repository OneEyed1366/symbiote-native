import { useState } from 'react';
import type { ReanimatedEvent } from 'react-native-reanimated/src/hook/commonTypes';
import {
  createEventHandler,
  type IEventHandlerInternal,
} from '../../core/event-handlers';

export type IEventHandler<
  Event extends object,
  Context extends Record<string, unknown> = never,
> = (event: ReanimatedEvent<Event>, context?: Context) => void;

// Upstream types the result as a plain function, but it is the holder a prop of an animated view
// takes, so the type says so
export function useEvent<
  Event extends object,
  Context extends Record<string, unknown> = never,
>(
  handler: IEventHandler<Event, Context>,
  eventNames: readonly string[] = [],
  rebuild = false,
): IEventHandlerInternal<Event> {
  const [controller] = useState(() =>
    createEventHandler<Event>(handler, [...eventNames]),
  );
  return controller.refresh(handler, [...eventNames], rebuild);
}
