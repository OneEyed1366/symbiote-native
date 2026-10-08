import {
  AppRegistry,
  DeviceEventEmitter,
  Dimensions,
  EventEmitter,
  InteractionManager,
  Platform,
  Settings,
  StyleSheet,
} from '@symbiote-native/react';
import type { IProbeResult } from './ParityCard';

export type IModuleProbe = {
  id: string;
  title: string;
  rn: string;
  run: () => IProbeResult;
};

const BUS_EVENT = 'parity-args';
const ARGS = [1, 'two', 3];
const SETTINGS_KEY = 'parity-key';
const UNKNOWN_KEY = 'parity-unknown';

function errorLine(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

// Runs `action` and answers the error it throws, or null when it does not throw
function thrownBy(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return errorLine(error);
  }
}

function checkThrows(action: () => unknown, expected: string): IProbeResult {
  const message = thrownBy(action);
  if (message === null) return { isOk: false, detail: 'did not throw' };
  return { isOk: message.includes(expected), detail: message };
}

function checkReceivedArgs(
  subscribe: (listener: (...args: unknown[]) => void) => { remove(): void },
  emit: () => void,
): IProbeResult {
  let received: unknown[] = [];
  const subscription = subscribe((...args) => {
    received = args;
  });
  emit();
  subscription.remove();
  return {
    isOk: received.join() === ARGS.join(),
    detail: `listener got [${received.join(', ')}]`,
  };
}

function deviceBusArgs(): IProbeResult {
  return checkReceivedArgs(
    listener => DeviceEventEmitter.addListener(BUS_EVENT, listener),
    () => DeviceEventEmitter.emit(BUS_EVENT, ...ARGS),
  );
}

function eventEmitterClass(): IProbeResult {
  const emitter = new EventEmitter();
  return checkReceivedArgs(
    listener => emitter.addListener(BUS_EVENT, listener),
    () => emitter.emit(BUS_EVENT, ...ARGS),
  );
}

function listenerMustBeFunction(): IProbeResult {
  return checkThrows(
    () =>
      Reflect.apply(DeviceEventEmitter.addListener, DeviceEventEmitter, [
        BUS_EVENT,
        'not a function',
      ]),
    '2nd argument must be a function',
  );
}

function styleSheetFreezes(): IProbeResult {
  const sheet = StyleSheet.create({ box: { flex: 1 } });
  const isDev = Reflect.get(globalThis, '__DEV__') === true;
  const isFrozen = Object.isFrozen(sheet.box);
  return {
    isOk: isDev === isFrozen,
    detail: `__DEV__ ${String(isDev)}, created style frozen ${String(isFrozen)}`,
  };
}

function unknownDimension(): IProbeResult {
  return checkThrows(
    () => Reflect.apply(Dimensions.get, Dimensions, [UNKNOWN_KEY]),
    `No dimension set for key ${UNKNOWN_KEY}`,
  );
}

function unknownApplication(): IProbeResult {
  return checkThrows(
    () => AppRegistry.runApplication(UNKNOWN_KEY, { rootTag: 0 }),
    'has not been registered',
  );
}

function interactionStub(): IProbeResult {
  const handle = InteractionManager.createInteractionHandle();
  InteractionManager.clearInteractionHandle(handle);
  return {
    isOk: handle === -1,
    detail: `createInteractionHandle() = ${handle}`,
  };
}

function settingsOwnWrite(): IProbeResult {
  let firedCount = 0;
  const watchId = Settings.watchKeys(SETTINGS_KEY, () => {
    firedCount += 1;
  });
  Settings.set({ [SETTINGS_KEY]: firedCount });
  Settings.clearWatch(watchId);
  return {
    isOk: firedCount === 0,
    detail: `watchKeys callback fired ${firedCount} times for the own write`,
  };
}

const COMMON_PROBES: readonly IModuleProbe[] = [
  {
    id: 'device-bus-args',
    title: 'DeviceEventEmitter hands over every emit argument',
    rn: 'a listener gets all of emit(type, 1, "two", 3), not only the first',
    run: deviceBusArgs,
  },
  {
    id: 'event-emitter-class',
    title: 'EventEmitter is exported and constructible',
    rn: 'react-native exposes the EventEmitter class itself',
    run: eventEmitterClass,
  },
  {
    id: 'listener-guard',
    title: 'addListener rejects a non-function',
    rn: 'throws "EventEmitter.addListener(...): 2nd argument must be a function."',
    run: listenerMustBeFunction,
  },
  {
    id: 'stylesheet-freeze',
    title: 'StyleSheet.create freezes in a dev bundle',
    rn: 'each created entry is frozen under __DEV__, plain in release',
    run: styleSheetFreezes,
  },
  {
    id: 'dimensions-key',
    title: 'Dimensions.get on an unknown key',
    rn: 'throws "No dimension set for key X"',
    run: unknownDimension,
  },
  {
    id: 'app-registry',
    title: 'AppRegistry.runApplication on an unregistered key',
    rn: 'throws the "has not been registered" invariant',
    run: unknownApplication,
  },
  {
    id: 'interaction-manager',
    title: 'InteractionManager is the 0.86 stub',
    rn: 'createInteractionHandle() returns -1 and blocks nothing',
    run: interactionStub,
  },
];

const IOS_ONLY_PROBES: readonly IModuleProbe[] = [
  {
    id: 'settings-own-write',
    title: 'Settings.set does not fire its own watchKeys',
    rn: 'native ignores updates it caused, only an external change fires',
    run: settingsOwnWrite,
  },
];

export const MODULE_PROBES: readonly IModuleProbe[] = [
  ...COMMON_PROBES,
  ...(Platform.select({ ios: IOS_ONLY_PROBES }) ?? []),
];
