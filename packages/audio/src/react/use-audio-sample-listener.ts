import { useEffect } from 'react';
import { subscribeAudioSampleListener } from '../core/audio-sample-listener';
import type { IAudioSamplePlayer } from '../core/audio-sample-listener';
import type { IAudioSample } from '../core/types';

/** React twin of `expo-audio`'s `useAudioSampleListener` */
export function useAudioSampleListener(
  player: IAudioSamplePlayer,
  listener: (data: IAudioSample) => void,
): void {
  useEffect(
    () => subscribeAudioSampleListener(player, listener),
    [player, listener],
  );
}
