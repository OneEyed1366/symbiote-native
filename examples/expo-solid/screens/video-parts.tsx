import type { Accessor } from 'solid-js';
import { useEvent } from '@symbiote-native/solid';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type { IVideoPlayerEvents, VideoPlayer } from '@symbiote-native/video/solid';
import { ResultRow } from '../components/ScreenShell';
import { statusLine, timeLine } from './video-shared';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<IVideoPlayerEvents, TName>;

// The player is a class generic over its events, so the map is named once here for TS
export function usePlayerEvent<TName extends IPlayerEventName>(
  player: Accessor<VideoPlayer>,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): Accessor<IPlayerPayload<TName>> {
  const event = useEvent<IVideoPlayerEvents, TName>(player, () => name, initialValue);
  return () => event() ?? initialValue;
}

export function usePlayerEventOrNull<TName extends IPlayerEventName>(
  player: Accessor<VideoPlayer>,
  name: TName,
): Accessor<IPlayerPayload<TName> | null> {
  return useEvent<IVideoPlayerEvents, TName>(player, () => name);
}

// Live values of the player through the `useEvent` primitive of the adapter
export function PlayerStatusRows(props: { player: Accessor<VideoPlayer>; prefix: string }) {
  const status = usePlayerEvent(props.player, 'statusChange', { status: props.player().status });
  const playing = usePlayerEvent(props.player, 'playingChange', { isPlaying: props.player().playing });
  const time = usePlayerEvent(props.player, 'timeUpdate', {
    currentTime: props.player().currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: props.player().bufferedPosition,
  });
  return (
    <>
      <ResultRow testID={`${props.prefix}-status`} label="statusChange" value={statusLine(status().status, status().error?.message)} />
      <ResultRow testID={`${props.prefix}-playing`} label="playingChange" value={String(playing().isPlaying)} />
      <ResultRow
        testID={`${props.prefix}-time`}
        label="timeUpdate"
        value={timeLine(time().currentTime, props.player().duration, time().bufferedPosition)}
      />
    </>
  );
}
