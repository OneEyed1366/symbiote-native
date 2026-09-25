import { NativeModule, requireNativeModule } from 'expo-modules-core';
import type { ISpeechOptions, IVoice } from './types';

const EXPO_SPEECH_MODULE_NAME = 'ExpoSpeech';

type ISpeechEventParams = { id: string };

export type ISpeechEventsMap = {
  'Exponent.speakingStarted': (params: ISpeechEventParams) => void;
  'Exponent.speakingWillSayNextString': (
    params: ISpeechEventParams & { charIndex: number; charLength: number },
  ) => void;
  'Exponent.speakingDone': (params: ISpeechEventParams) => void;
  'Exponent.speakingStopped': (params: ISpeechEventParams) => void;
  /** Android only supplies `error`; iOS never emits this event at all. */
  'Exponent.speakingError': (
    params: ISpeechEventParams & { error?: string },
  ) => void;
};

export declare class NativeSpeechModule extends NativeModule<ISpeechEventsMap> {
  maxSpeechInputLength?: number;
  speak(
    utteranceId: string,
    text: string,
    options: ISpeechOptions,
  ): Promise<void>;
  getVoices?(): Promise<IVoice[]>;
  isSpeaking(): Promise<boolean>;
  stop(): Promise<void>;
  /** iOS only; absent on Android's native module. */
  pause?(): Promise<void>;
  /** iOS only; absent on Android's native module. */
  resume?(): Promise<void>;
}

export const expoSpeech = requireNativeModule<NativeSpeechModule>(
  EXPO_SPEECH_MODULE_NAME,
);
