import { UnavailabilityError } from 'expo-modules-core';
import { expoSpeech } from './native-module';
import type { ISpeechEventsMap } from './native-module';
import type { ISpeechOptions, IVoice } from './types';

const callbacksById: Record<string, ISpeechOptions> = {};
let nextCallbackId = 1;
let hasRegisteredListeners = false;

function makeCallbackId(): string {
  return String(nextCallbackId++);
}

function unregisterListenersIfNoneNeeded(): void {
  if (Object.keys(callbacksById).length > 0) return;
  removeSpeakingListener('Exponent.speakingStarted');
  removeSpeakingListener('Exponent.speakingWillSayNextString');
  removeSpeakingListener('Exponent.speakingDone');
  removeSpeakingListener('Exponent.speakingStopped');
  removeSpeakingListener('Exponent.speakingError');
  hasRegisteredListeners = false;
}

function registerListenersIfNeeded(): void {
  if (hasRegisteredListeners) return;
  hasRegisteredListeners = true;

  setSpeakingListener('Exponent.speakingStarted', ({ id }) => {
    callbacksById[id]?.onStart?.();
  });
  setSpeakingListener(
    'Exponent.speakingWillSayNextString',
    ({ id, charIndex, charLength }) => {
      callbacksById[id]?.onBoundary?.({ charIndex, charLength });
    },
  );
  setSpeakingListener('Exponent.speakingDone', ({ id }) => {
    callbacksById[id]?.onDone?.();
    delete callbacksById[id];
    unregisterListenersIfNoneNeeded();
  });
  setSpeakingListener('Exponent.speakingStopped', ({ id }) => {
    callbacksById[id]?.onStopped?.();
    delete callbacksById[id];
    unregisterListenersIfNoneNeeded();
  });
  setSpeakingListener('Exponent.speakingError', ({ id, error }) => {
    callbacksById[id]?.onError?.(new Error(error));
    delete callbacksById[id];
    unregisterListenersIfNoneNeeded();
  });
}

function setSpeakingListener<TName extends keyof ISpeechEventsMap>(
  eventName: TName,
  listener: ISpeechEventsMap[TName],
): void {
  if (expoSpeech.listenerCount(eventName) > 0) {
    expoSpeech.removeAllListeners(eventName);
  }
  expoSpeech.addListener(eventName, listener);
}

function removeSpeakingListener(eventName: keyof ISpeechEventsMap): void {
  expoSpeech.removeAllListeners(eventName);
}

/** Adds `text` to the speech queue. Calling this while another utterance is speaking queues it. */
export function speak(text: string, options: ISpeechOptions = {}): void {
  const id = makeCallbackId();
  callbacksById[id] = options;
  registerListenersIfNeeded();
  expoSpeech.speak(id, text, options);
}

export async function getAvailableVoicesAsync(): Promise<IVoice[]> {
  if (!expoSpeech.getVoices) {
    throw new UnavailabilityError('Speech', 'getVoices');
  }
  return expoSpeech.getVoices();
}

/** `true` even while paused. */
export async function isSpeakingAsync(): Promise<boolean> {
  return expoSpeech.isSpeaking();
}

/** Interrupts current speech and clears the queue. */
export async function stop(): Promise<void> {
  return expoSpeech.stop();
}

/** iOS only; throws `UnavailabilityError` on Android. */
export async function pause(): Promise<void> {
  if (!expoSpeech.pause) {
    throw new UnavailabilityError('Speech', 'pause');
  }
  return expoSpeech.pause();
}

/** iOS only; throws `UnavailabilityError` on Android. */
export async function resume(): Promise<void> {
  if (!expoSpeech.resume) {
    throw new UnavailabilityError('Speech', 'resume');
  }
  return expoSpeech.resume();
}

/** Platform-dependent; iOS returns `Number.MAX_VALUE`. */
export const maxSpeechInputLength: number =
  expoSpeech.maxSpeechInputLength ?? Number.MAX_VALUE;
