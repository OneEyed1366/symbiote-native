export enum VoiceQuality {
  Default = 'Default',
  Enhanced = 'Enhanced',
}

export type IVoice = {
  identifier: string;
  name: string;
  quality: VoiceQuality;
  language: string;
};

export type INativeBoundaryEvent = { charIndex: number; charLength: number };
export type INativeBoundaryEventCallback = (
  event: INativeBoundaryEvent,
) => void;

export type ISpeechOptions = {
  /** IETF BCP 47 language code. */
  language?: string;
  /** `1.0` is the normal pitch. */
  pitch?: number;
  /** `1.0` is the normal rate. */
  rate?: number;
  /** iOS only — `false` lets the system manage a separate audio session for the speech. */
  useApplicationAudioSession?: boolean;
  onStart?: () => void;
  /** Invoked when speaking is stopped by calling `stop()`. */
  onStopped?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
  /** `0.0` (muted) to `1.0` (max volume). Default `1.0`. */
  volume?: number;
  voice?: string;
  onBoundary?: INativeBoundaryEventCallback | null;
};
