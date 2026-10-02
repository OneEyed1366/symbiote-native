import { subscribeAudioStreamBuffer } from './audio-stream-subscription';
import type { IAudioStreamBufferSource } from './audio-stream-subscription';
import type { IAudioStreamBuffer } from './types';

// Shared by adapters whose reactivity auto-tracks reads inside a plain effect (Vue's
// `watchEffect`, Solid's `createEffect`, Angular's `effect`); React's render model doesn't, so
// it keeps its own ref-based wiring - same split as `createNetworkRequestObserverLifecycle`
export function runAudioStreamBufferEffect<
  TStream extends IAudioStreamBufferSource,
>(
  getStream: () => TStream,
  getOnBuffer: () => ((buffer: IAudioStreamBuffer) => void) | undefined,
  runEffect: (effect: () => void) => void,
  registerCleanup: (cleanup: () => void) => void,
): void {
  runEffect(() => {
    registerCleanup(subscribeAudioStreamBuffer(getStream(), getOnBuffer()));
  });
}
