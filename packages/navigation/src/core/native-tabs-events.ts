// Events of the native tabs host, wired as native event props
// Native sends a plain payload record, each field is read with a type guard and a zero default

import type { ISymbioteEvent } from '@symbiote-native/engine';

const TAB_ACTION_ORIGINS = [
  'user',
  'programmatic-js',
  'programmatic-native',
  'implicit',
] as const;

export type ITabActionOrigin = (typeof TAB_ACTION_ORIGINS)[number];
export type ITabRejectionReason = 'stale' | 'repeated';

export type ITabSelectedEvent = {
  selectedScreenKey: string;
  provenance: number;
  isRepeated: boolean;
  hasTriggeredSpecialEffect: boolean;
  actionOrigin: ITabActionOrigin;
};

export type ITabSelectionRejectedEvent = {
  selectedScreenKey: string;
  provenance: number;
  rejectedScreenKey: string;
  rejectedBaseProvenance: number;
  rejectionReason: ITabRejectionReason;
};

export type ITabSelectionPreventedEvent = {
  selectedScreenKey: string;
  provenance: number;
  preventedScreenKey: string;
};

export type IMoreTabSelectedEvent = {
  selectedScreenKey: string;
  provenance: number;
};

export type INativeTabsEventCallbacks = {
  onTabSelected?: (event: ITabSelectedEvent) => void;
  onTabSelectionRejected?: (event: ITabSelectionRejectedEvent) => void;
  onTabSelectionPrevented?: (event: ITabSelectionPreventedEvent) => void;
};

type IEventRecord = Record<string, unknown>;
type IEventHandler = (event: ISymbioteEvent) => void;

function readString(record: IEventRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(record: IEventRecord, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

function readActionOrigin(record: IEventRecord): ITabActionOrigin {
  const value = record.actionOrigin;
  return TAB_ACTION_ORIGINS.find(origin => origin === value) ?? 'implicit';
}

function readSelected(record: IEventRecord): ITabSelectedEvent {
  return {
    selectedScreenKey: readString(record, 'selectedScreenKey'),
    provenance: readNumber(record, 'provenance'),
    isRepeated: record.isRepeated === true,
    hasTriggeredSpecialEffect: record.hasTriggeredSpecialEffect === true,
    actionOrigin: readActionOrigin(record),
  };
}

function readRejected(record: IEventRecord): ITabSelectionRejectedEvent {
  return {
    selectedScreenKey: readString(record, 'selectedScreenKey'),
    provenance: readNumber(record, 'provenance'),
    rejectedScreenKey: readString(record, 'rejectedScreenKey'),
    rejectedBaseProvenance: readNumber(record, 'rejectedBaseProvenance'),
    rejectionReason:
      record.rejectionReason === 'repeated' ? 'repeated' : 'stale',
  };
}

function readPrevented(record: IEventRecord): ITabSelectionPreventedEvent {
  return {
    selectedScreenKey: readString(record, 'selectedScreenKey'),
    provenance: readNumber(record, 'provenance'),
    preventedScreenKey: readString(record, 'preventedScreenKey'),
  };
}

export function readMoreTabSelected(
  record: IEventRecord,
): IMoreTabSelectedEvent {
  return {
    selectedScreenKey: readString(record, 'selectedScreenKey'),
    provenance: readNumber(record, 'provenance'),
  };
}

// A handler is wired only for an event the app listens to, as native fires it per listener
export function wireTabsEvent<TPayload>(
  callback: ((payload: TPayload) => void) | undefined,
  readPayload: (record: IEventRecord) => TPayload,
): IEventHandler | undefined {
  if (!callback) return undefined;
  return event => callback(readPayload(event.nativeEvent));
}

export function resolveNativeTabsEvents(
  callbacks: INativeTabsEventCallbacks,
): Record<string, IEventHandler> {
  const handlers = {
    onTabSelected: wireTabsEvent(callbacks.onTabSelected, readSelected),
    onTabSelectionRejected: wireTabsEvent(
      callbacks.onTabSelectionRejected,
      readRejected,
    ),
    onTabSelectionPrevented: wireTabsEvent(
      callbacks.onTabSelectionPrevented,
      readPrevented,
    ),
  };
  const wired: Record<string, IEventHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    if (handler) wired[name] = handler;
  }
  return wired;
}
