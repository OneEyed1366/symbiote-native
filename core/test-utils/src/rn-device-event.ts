// Native pushes a device event through RN's `RCTDeviceEventEmitter`, which is where RN's own
// `Dimensions`, `Appearance` and `AppState` listen once the engine forwards to them

import RCTDeviceEventEmitter from 'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter';

export function emitRnDeviceEvent(eventType: string, payload: unknown): void {
  const emit: unknown = Reflect.get(RCTDeviceEventEmitter, 'emit');
  if (typeof emit !== 'function') {
    throw new Error('RN device event emitter has no emit');
  }
  Reflect.apply(emit, RCTDeviceEventEmitter, [eventType, payload]);
}
