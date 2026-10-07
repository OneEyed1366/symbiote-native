import { useEvent } from '@symbiote-native/react';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type { IVideoPlayerEvents, VideoPlayer } from '@symbiote-native/video/react';
import { ResultRow } from '../components/ScreenShell';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<IVideoPlayerEvents, TName>;

// The player is a class generic over its events, so the map is named once here for TS
export function usePlayerEvent<TName extends IPlayerEventName>(
  player: VideoPlayer,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): IPlayerPayload<TName> {
  return useEvent<IVideoPlayerEvents, TName>(player, name, initialValue);
}

export function usePlayerEventOrNull<TName extends IPlayerEventName>(
  player: VideoPlayer,
  name: TName,
): IPlayerPayload<TName> | null {
  return useEvent<IVideoPlayerEvents, TName>(player, name);
}

export const MP4_URI = 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';
export const CLIP_URI = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
export const HLS_URI =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8';
export const TIME_UPDATE_SECONDS = 0.5;
const SECONDS_PER_MINUTE = 60;

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const rest = String(whole % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${Math.floor(whole / SECONDS_PER_MINUTE)}:${rest}`;
}

// Live values of the player through the `useEvent` hook of the adapter
export function PlayerStatusRows({ player, prefix }: { player: VideoPlayer; prefix: string }) {
  const status = usePlayerEvent(player, 'statusChange', { status: player.status });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = usePlayerEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });
  const error = status.error?.message;
  return (
    <>
      <ResultRow testID={`${prefix}-status`} label="statusChange" value={error === undefined ? status.status : `${status.status}: ${error}`} />
      <ResultRow testID={`${prefix}-playing`} label="playingChange" value={String(playing.isPlaying)} />
      <ResultRow
        testID={`${prefix}-time`}
        label="timeUpdate"
        value={`${formatTime(time.currentTime)} / ${formatTime(player.duration)}, buffered to ${formatTime(time.bufferedPosition)}`}
      />
    </>
  );
}
