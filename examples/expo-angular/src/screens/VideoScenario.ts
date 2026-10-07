import { Component, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { CameraView, ICameraMode } from '@symbiote-native/camera/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { RecordedClip } from './RecordedClip';
import { MAX_RECORD_SECONDS, errorLine } from './camera-shared';

@Component({
  selector: 'VideoScenario',
  standalone: true,
  imports: [ActionButton, RecordedClip, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="camera-video-scenario"
      title="Record a short video message"
      why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
      [steps]="steps"
      [expect]="expectText"
    >
      <ResultRow
        testID="camera-mode-line"
        label="Camera mode"
        [value]="mode()"
      />
      <view class="button-row">
        <ActionButton
          testID="camera-record"
          title="Record"
          [color]="color()"
          (press)="record()"
        />
        <ActionButton
          testID="camera-stop"
          title="Stop"
          [color]="color()"
          (press)="camera()?.stopRecording()"
        />
        <ActionButton
          testID="camera-pause-record"
          title="Pause or resume (iOS 18)"
          [color]="color()"
          (press)="togglePause()"
        />
      </view>
      <ResultRow
        testID="camera-record-result"
        label="recordAsync"
        [value]="line()"
      />
      @if (uri(); as clip) {
        <RecordedClip [uri]="clip" />
      }
    </Scenario>
  `,
})
export class VideoScenario {
  readonly camera = input<CameraView | undefined>();
  readonly mode = input.required<ICameraMode>();
  readonly color = input.required<string>();

  readonly steps = [
    'Switch the camera to the recording mode above',
    'Press Record and wait, or press Stop after a few seconds',
    'Play the clip below',
  ];
  readonly expectText = `The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`;
  readonly uri = signal<string | null>(null);
  readonly line = signal('not recording');

  async record(): Promise<void> {
    this.line.set('recording…');
    try {
      const result = await this.camera()?.recordAsync({
        maxDuration: MAX_RECORD_SECONDS,
      });
      this.uri.set(result?.uri ?? null);
      this.line.set(result === undefined ? 'stopped with no file' : 'saved');
    } catch (error) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }

  async togglePause(): Promise<void> {
    try {
      await this.camera()?.toggleRecordingAsync();
    } catch (error) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }
}
