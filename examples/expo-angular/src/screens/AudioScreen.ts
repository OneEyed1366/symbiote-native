import { Component } from '@angular/core';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AudioModuleCalls } from './AudioModuleCalls';
import { AudioPlaybackScenario } from './AudioPlaybackScenario';
import { AudioPlayerCards } from './AudioPlayerCards';
import { AudioPlaylistCards } from './AudioPlaylistCards';
import { AudioRecorderCards } from './AudioRecorderCards';
import { AudioRecordingScenario } from './AudioRecordingScenario';
import { AudioStreamCards } from './AudioStreamCards';

@Component({
  selector: 'AudioScreen',
  standalone: true,
  imports: [
    AudioModuleCalls,
    AudioPlaybackScenario,
    AudioPlayerCards,
    AudioPlaylistCards,
    AudioRecorderCards,
    AudioRecordingScenario,
    AudioStreamCards,
    Explorer,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="audio-scroll"
      title="Audio"
      body="Play music and podcasts, queue playlists, record voice notes and stream the microphone. Audio session modes, permissions and preloading are in the explorer."
    >
      <AudioPlaybackScenario />
      <AudioRecordingScenario />
      <Explorer testID="audio-explorer" [color]="color">
        <ng-template>
          <AudioModuleCalls />
          <AudioStreamCards />
          <AudioPlayerCards />
          <AudioRecorderCards />
          <AudioPlaylistCards />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class AudioScreen {
  readonly route = ROUTE_NAME.Audio;
  readonly color = lineColorOf(ROUTE_NAME.Audio);
}
