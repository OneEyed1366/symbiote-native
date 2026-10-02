import { RECORDING_STATUS_UPDATE } from './types';
import { subscribeSingleEvent } from './subscribe-single-event';
import type { IRecordingStatus } from './types';

export type IStatusRecorder = {
  addListener: (
    event: typeof RECORDING_STATUS_UPDATE,
    listener: (status: IRecordingStatus) => void,
  ) => { remove: () => void };
};

// Ported from `useAudioRecorder`'s status-listener `useEffect` body
export function subscribeRecordingStatus(
  recorder: IStatusRecorder,
  statusListener: ((status: IRecordingStatus) => void) | undefined,
): () => void {
  return subscribeSingleEvent(
    recorder,
    RECORDING_STATUS_UPDATE,
    statusListener,
  );
}
