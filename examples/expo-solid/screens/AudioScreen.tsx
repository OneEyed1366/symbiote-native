import { Explorer } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { AudioScenarios } from './audio-scenarios';
import { ModuleStreamCards } from './audio-module-stream';
import { PlayerCards } from './audio-player';
import { PlaylistCards } from './audio-playlist';
import { RecorderCards } from './audio-recorder';

export function AudioScreen() {
  return (
    <ScreenShell
      route={ROUTE_NAME.Audio}
      testID="audio-scroll"
      title="Audio"
      body="Play music and podcasts, queue playlists, record voice notes and stream the microphone. Audio session modes, permissions and preloading are in the explorer."
    >
      <AudioScenarios />
      <Explorer testID="audio-explorer" color={lineColorOf(ROUTE_NAME.Audio)}>
        <ModuleStreamCards />
        <PlayerCards />
        <RecorderCards />
        <PlaylistCards />
      </Explorer>
    </ScreenShell>
  );
}
