import type { IRecorderState } from './types';

const METERING_EPSILON = 0.1;
const DURATION_EPSILON_MS = 50;

function meteringChanged(prev: IRecorderState, next: IRecorderState): boolean {
  if ((prev.metering === undefined) !== (next.metering === undefined))
    return true;
  if (prev.metering === undefined || next.metering === undefined) return false;
  return Math.abs(prev.metering - next.metering) > METERING_EPSILON;
}

// Ported from `useAudioRecorderState`'s poll-diff `setState` body
export function shouldUpdateRecorderState(
  prev: IRecorderState,
  next: IRecorderState,
): boolean {
  return (
    prev.canRecord !== next.canRecord ||
    prev.isRecording !== next.isRecording ||
    prev.mediaServicesDidReset !== next.mediaServicesDidReset ||
    prev.url !== next.url ||
    Math.abs(prev.durationMillis - next.durationMillis) > DURATION_EPSILON_MS ||
    meteringChanged(prev, next)
  );
}
