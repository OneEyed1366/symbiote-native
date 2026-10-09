// native -> JS: device events ride RN's own `RCTDeviceEventEmitter`, the module native invokes
// A listener is wrapped so its `setState` lands on the sync lane

import { runWrapped } from './dispatch';
import {
  createNativeEventEmitter,
  DeviceEventEmitter as HostDeviceEventEmitter,
} from './react-native-host';

export type IEventSubscription = {
  remove(): void;
};

// A module that emits events is told via these counters when JS starts or stops observing
// Optional: a plain device event with no owning module needs none
export type IEventEmitterModule = {
  addListener(eventType: string): void;
  removeListeners(count: number): void;
};

// The payload native emitted, untyped here: the listener narrows it with a runtime guard
export type INativeEventListener = (
  payload: unknown,
  ...rest: unknown[]
) => void;

// What RN's bus and RN's `NativeEventEmitter` both answer
type IUpstreamBus = {
  addListener(
    eventType: string,
    listener: (...args: unknown[]) => void,
    context?: unknown,
  ): IEventSubscription;
  emit(eventType: string, ...args: unknown[]): void;
  listenerCount(eventType: string): number;
  removeAllListeners(eventType?: string): void;
};

// RN rejects a non-function itself, so one is handed over untouched
function onSyncLane(
  listener: INativeEventListener,
  context: unknown,
): INativeEventListener {
  if (typeof listener !== 'function') return listener;
  return (...args: unknown[]): void => {
    runWrapped(() => {
      Reflect.apply(listener, context, args);
    });
  };
}

function subscribe(
  bus: IUpstreamBus,
  eventType: string,
  listener: INativeEventListener,
  context: unknown,
): IEventSubscription {
  return bus.addListener(eventType, onSyncLane(listener, context));
}

// RN's `DeviceEventEmitter` and its alias `NativeAppEventEmitter`: the device bus itself
export const DeviceEventEmitter = {
  addListener(
    eventType: string,
    listener: INativeEventListener,
    context?: unknown,
  ): IEventSubscription {
    return subscribe(HostDeviceEventEmitter, eventType, listener, context);
  },
  emit(eventType: string, ...args: unknown[]): void {
    HostDeviceEventEmitter.emit(eventType, ...args);
  },
  listenerCount(eventType: string): number {
    return HostDeviceEventEmitter.listenerCount(eventType);
  },
  removeAllListeners(eventType?: string): void {
    HostDeviceEventEmitter.removeAllListeners(eventType);
  },
};

export const NativeAppEventEmitter = DeviceEventEmitter;

// Events of one native module, RN's `NativeEventEmitter` pings the module's observe counters
// Without a module the device bus answers, since RN's iOS constructor would refuse
export class NativeEventEmitter {
  private readonly upstream: IUpstreamBus;

  constructor(module?: IEventEmitterModule) {
    this.upstream =
      module === undefined
        ? HostDeviceEventEmitter
        : createNativeEventEmitter(module);
  }

  // The listeners of the event on the device bus, not only this emitter's
  listenerCount(eventType: string): number {
    return this.upstream.listenerCount(eventType);
  }

  addListener(
    eventType: string,
    listener: INativeEventListener,
    context?: unknown,
  ): IEventSubscription {
    return subscribe(this.upstream, eventType, listener, context);
  }

  emit(eventType: string, ...args: unknown[]): void {
    this.upstream.emit(eventType, ...args);
  }

  removeAllListeners(eventType: string): void {
    this.upstream.removeAllListeners(eventType);
  }
}
