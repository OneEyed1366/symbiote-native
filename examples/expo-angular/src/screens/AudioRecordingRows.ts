import { Component, OnInit, input } from '@angular/core';
import { injectAudioRecorderState } from '@symbiote-native/audio/angular';
import type {
  AudioRecorder,
  IRecorderState,
} from '@symbiote-native/audio/angular';
import { ResultRow } from '../components/ResultRow';
import { bindAfterInputs } from './bind-after-inputs';

@Component({
  selector: 'AudioRecordingRows',
  standalone: true,
  imports: [ResultRow],
  template: `
    @if (state.value(); as current) {
      <ResultRow
        testID="audio-recording-state"
        label="recording"
        [value]="'' + current.isRecording"
      />
      <ResultRow
        testID="audio-recording-duration"
        label="duration"
        [value]="secondsOf(current) + ' s'"
      />
      <ResultRow
        testID="audio-recording-url"
        label="url"
        [value]="current.url ?? 'none'"
      />
    }
  `,
})
export class AudioRecordingRows implements OnInit {
  readonly recorder = input.required<AudioRecorder>();
  readonly state = bindAfterInputs<IRecorderState>();

  // The parent re-creates these rows for every new recorder, so the recorder never changes here
  ngOnInit(): void {
    this.state.connect(() => injectAudioRecorderState(this.recorder()));
  }

  secondsOf(current: IRecorderState): number {
    return Math.round(current.durationMillis / 1_000);
  }
}
