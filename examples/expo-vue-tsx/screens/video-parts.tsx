import { computed, defineComponent } from 'vue';
import type { ComputedRef } from 'vue';
import { useEvent } from '@symbiote-native/vue';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type { IVideoPlayerEvents, VideoPlayer } from '@symbiote-native/video/vue';
import { ResultRow } from '../components/ScreenShell';
import { statusLine, timeLine } from './video-shared';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<IVideoPlayerEvents, TName>;

// The player is a class generic over its events, so the map is named once here for TS
export function usePlayerEvent<TName extends IPlayerEventName>(
  player: ComputedRef<VideoPlayer>,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): ComputedRef<IPlayerPayload<TName>> {
  const event = useEvent<IVideoPlayerEvents, TName>(player, name, initialValue);
  return computed(() => event.value ?? initialValue);
}

export function usePlayerEventOrNull<TName extends IPlayerEventName>(
  player: ComputedRef<VideoPlayer>,
  name: TName,
) {
  return useEvent<IVideoPlayerEvents, TName>(player, name);
}

type IStatusRowsProps = { player: ComputedRef<VideoPlayer>; prefix: string };

// Live values of the player through the `useEvent` composable of the adapter
export const PlayerStatusRows = defineComponent<IStatusRowsProps>(
  props => {
    const status = usePlayerEvent(props.player, 'statusChange', { status: props.player.value.status });
    const playing = usePlayerEvent(props.player, 'playingChange', { isPlaying: props.player.value.playing });
    const time = usePlayerEvent(props.player, 'timeUpdate', {
      currentTime: props.player.value.currentTime,
      currentLiveTimestamp: null,
      currentOffsetFromLive: null,
      bufferedPosition: props.player.value.bufferedPosition,
    });
    return () => (
      <>
        <ResultRow testID={`${props.prefix}-status`} label="statusChange" value={statusLine(status.value.status, status.value.error?.message)} />
        <ResultRow testID={`${props.prefix}-playing`} label="playingChange" value={String(playing.value.isPlaying)} />
        <ResultRow
          testID={`${props.prefix}-time`}
          label="timeUpdate"
          value={timeLine(time.value.currentTime, props.player.value.duration, time.value.bufferedPosition)}
        />
      </>
    );
  },
  { name: 'PlayerStatusRows', props: ['player', 'prefix'] },
);
