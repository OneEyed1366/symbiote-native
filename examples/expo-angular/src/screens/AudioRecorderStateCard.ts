import { Component, OnInit, input } from '@angular/core';
import { injectAudioRecorderState } from '@symbiote-native/audio/angular';
import type {
  AudioRecorder,
  IRecorderState,
} from '@symbiote-native/audio/angular';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { bindAfterInputs } from './bind-after-inputs';

@Component({
  selector: 'AudioRecorderStateCard',
  standalone: true,
  imports: [Card, ResultRow],
  template: `
    @if (state.value(); as current) {
      <Card testID="audio-recorder-state-card" title="useAudioRecorderState">
        <ResultRow
          testID="audio-recorder-can"
          label="canRecord, isRecording"
          [value]="current.canRecord + ', ' + current.isRecording"
        />
        <ResultRow
          testID="audio-recorder-duration"
          label="durationMillis"
          [value]="'' + current.durationMillis"
        />
        <ResultRow
          testID="audio-recorder-metering"
          label="metering"
          [value]="'' + (current.metering ?? 'off')"
        />
        <ResultRow
          testID="audio-recorder-url"
          label="url"
          [value]="current.url ?? 'none'"
        />
        <ResultRow
          testID="audio-recorder-reset"
          label="mediaServicesDidReset"
          [value]="'' + current.mediaServicesDidReset"
        />
      </Card>
    }
  `,
})
export class AudioRecorderStateCard implements OnInit {
  readonly recorder = input.required<AudioRecorder>();
  readonly interval = input.required<number>();
  readonly state = bindAfterInputs<IRecorderState>();

  // The parent re-creates this card for every new recorder or interval, so neither changes here
  ngOnInit(): void {
    this.state.connect(() =>
      injectAudioRecorderState(this.recorder(), this.interval()),
    );
  }
}
