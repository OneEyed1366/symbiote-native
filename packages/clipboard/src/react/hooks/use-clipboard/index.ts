// React lifecycle wiring over the framework-agnostic addClipboardListener subscription (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks and the shape of
// @symbiote-native/sensors' useAccelerometer, adjusted for clipboard's single always-on
// subscription (there is no per-call config like updateIntervalMs to resubscribe on).
import { useEffect, useState } from 'react';
import { addClipboardListener, type IClipboardEvent } from '../../../core';

export function useClipboard(): IClipboardEvent | null {
  const [event, setEvent] = useState<IClipboardEvent | null>(null);

  useEffect(() => {
    const subscription = addClipboardListener(setEvent);
    return () => subscription.remove();
  }, []);

  return event;
}
