// Screen events the app listens to through `IScreenOptions`, wired as native event props
// Native sends a plain payload record, each field is read with a type guard and a zero default

import type { ISymbioteEvent } from '@symbiote-native/engine';
import { buildTransitionProgressEvent } from './transition-progress';
import type { ITransitionProgress } from './transition-progress';
import type {
  IScreenEventCallbacks,
  IScreenEventPayloads,
  IScreenOptions,
} from './navigator-props';

type IEventRecord = Record<string, unknown>;

function readNumber(record: IEventRecord, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

function readBoolean(record: IEventRecord, key: string): boolean {
  return record[key] === true;
}

function readTransition(
  record: IEventRecord,
): IScreenEventPayloads['onTransitionProgress'] {
  return {
    progress: readNumber(record, 'progress'),
    closing: readNumber(record, 'closing'),
    goingForward: readNumber(record, 'goingForward'),
  };
}

function wireEvent<K extends keyof IScreenEventPayloads>(
  callback: IScreenEventCallbacks[K],
  readPayload: (record: IEventRecord) => IScreenEventPayloads[K],
): ((event: ISymbioteEvent) => void) | undefined {
  if (!callback) return undefined;
  return event => callback(readPayload(event.nativeEvent));
}

// The header config fires attach and detach without a payload, native names them without a prefix
export function resolveHeaderOptionEvents(
  options: IScreenOptions,
): Record<string, () => void> {
  const { onHeaderAttached, onHeaderDetached } = options;
  const handlers: Record<string, () => void> = {};
  if (onHeaderAttached) handlers.onAttached = () => onHeaderAttached();
  if (onHeaderDetached) handlers.onDetached = () => onHeaderDetached();
  return handlers;
}

// Only callbacks the app set get a key, so an unset event registers no native listener
export function resolveScreenOptionEvents(
  options: IScreenOptions,
  transition?: ITransitionProgress,
): Record<string, (event: ISymbioteEvent) => void> {
  const wired = {
    onNativeDismissCancelled: wireEvent(
      options.onNativeDismissCancelled,
      record => ({ dismissCount: readNumber(record, 'dismissCount') }),
    ),
    onHeaderHeightChange: wireEvent(options.onHeaderHeightChange, record => ({
      headerHeight: readNumber(record, 'headerHeight'),
    })),
    onTransitionProgress: wireEvent(
      options.onTransitionProgress,
      readTransition,
    ),
    onGestureCancel: wireEvent(options.onGestureCancel, () => ({})),
    onSheetDetentChanged: wireEvent(options.onSheetDetentChanged, record => ({
      index: readNumber(record, 'index'),
      isStable: readBoolean(record, 'isStable'),
    })),
  };
  const handlers: Record<string, (event: ISymbioteEvent) => void> = {};
  for (const [name, handler] of Object.entries(wired)) {
    if (handler) handlers[name] = handler;
  }
  if (transition) {
    // One native listener drives the values and forwards the payload to the app callback
    const callback = options.onTransitionProgress;
    handlers.onTransitionProgress = buildTransitionProgressEvent(
      transition,
      callback && (record => callback(readTransition(record))),
    );
  }
  return handlers;
}
