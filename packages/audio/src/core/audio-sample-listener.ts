import { AUDIO_SAMPLE_UPDATE } from './types';
import type { IAudioSample } from './types';

export type IAudioSamplePlayer = {
  isAudioSamplingSupported: boolean;
  setAudioSamplingEnabled: (enabled: boolean) => void;
  addListener: (
    event: typeof AUDIO_SAMPLE_UPDATE,
    listener: (data: IAudioSample) => void,
  ) => { remove: () => void };
};

/** Ported from `expo-audio`'s `useAudioSampleListener` (its `useEffect` body factored out) */
export function subscribeAudioSampleListener(
  player: IAudioSamplePlayer,
  listener: (data: IAudioSample) => void,
): () => void {
  if (!player.isAudioSamplingSupported) return () => {};

  player.setAudioSamplingEnabled(true);
  const subscription = player.addListener(AUDIO_SAMPLE_UPDATE, listener);
  return () => subscription.remove();
}
