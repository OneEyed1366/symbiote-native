// RN's own `EventEmitter` class as is, its public methods are typed here to keep our own shapes

import EventEmitterUpstream from 'react-native/Libraries/vendor/emitter/EventEmitter';

export type IEmitterSubscription = {
  remove(): void;
};

export type IEventEmitter = {
  addListener(
    eventType: string,
    listener: (...args: unknown[]) => unknown,
    context?: unknown,
  ): IEmitterSubscription;
  emit(eventType: string, ...args: unknown[]): void;
  removeAllListeners(eventType?: string | null): void;
  listenerCount(eventType: string): number;
};

export const EventEmitter: new () => IEventEmitter = EventEmitterUpstream;
