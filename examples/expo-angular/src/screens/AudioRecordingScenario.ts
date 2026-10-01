import { Component, computed } from '@angular/core';
import {
  RecordingPresets,
  injectAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AudioRecordingRows } from './AudioRecordingRows';

@Component({
  selector: 'AudioRecordingScenario',
  standalone: true,
  imports: [AudioRecordingRows, CallConsole, Scenario],
  template: `
    <Scenario
      testID="audio-recording-scenario"
      title="Record a voice note"
      why="Capture a voice message or a memo to a file. The recorder needs the microphone permission and gives back a file URI you can play or upload."
      [steps]="steps"
      expect="While recording, the duration row counts up. After Stop the url row shows the recorded file, which you can play with the player above."
    >
      <CallConsole
        isBare
        prefix="audio-recording"
        title="Recorder"
        [color]="color"
        [calls]="calls"
      />
      @for (current of currentRecorder(); track current.id) {
        <AudioRecordingRows [recorder]="current" />
      }
    </Scenario>
  `,
})
export class AudioRecordingScenario {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly steps = [
    'Press Allow microphone and accept',
    'Press Start recording and speak',
    'Press Stop',
  ];

  private readonly recorder = injectAudioRecorder(
    () => RecordingPresets.HIGH_QUALITY,
  );
  readonly currentRecorder = computed(() => [this.recorder()]);

  readonly calls = [
    {
      label: 'Allow microphone',
      run: async () => {
        const permission = await requestRecordingPermissionsAsync();
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
        return permission;
      },
    },
    {
      label: 'Start recording',
      run: async () => {
        await this.recorder().prepareToRecordAsync();
        this.recorder().record();
        return 'recording';
      },
    },
    {
      label: 'Stop',
      run: async () => {
        await this.recorder().stop();
        return this.recorder().uri;
      },
    },
  ];
}
