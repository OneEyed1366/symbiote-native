import { Component } from '@angular/core';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { Scenario } from '../components/Scenario';
import { PlayerStatusRows } from './PlayerStatusRows';
import { MP4_URI, TIME_UPDATE_SECONDS } from './video-shared';

@Component({
  selector: 'BasicScenario',
  standalone: true,
  imports: [PlayerStatusRows, Scenario, VideoView],
  template: `
    <Scenario
      testID="video-basic-scenario"
      title="Play a video with the system controls"
      why="The quickest video screen: one source, native play, seek, fullscreen and subtitles buttons. Lessons, trailers and tutorials need nothing more."
      [steps]="steps"
      expect="The video plays with sound, the lines below follow it live: status goes loading, readyToPlay, playing turns true, the time moves, and pause turns playing back to false."
    >
      <VideoView
        testID="video-basic"
        [player]="player()"
        [nativeControls]="true"
        contentFit="contain"
        class="vid-video"
      />
      <PlayerStatusRows [player]="player" prefix="video-basic" />
    </Scenario>
  `,
})
export class BasicScenario {
  readonly steps = [
    'Press play on the native controls',
    'Drag the progress bar',
    'Press pause',
  ];
  readonly player = injectVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    },
  );
}
