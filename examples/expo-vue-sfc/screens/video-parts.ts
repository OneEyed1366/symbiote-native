import { computed } from 'vue';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import { useEvent } from '@symbiote-native/vue';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type {
  IVideoPlayerEvents,
  VideoPlayer,
} from '@symbiote-native/video/vue';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<
  IVideoPlayerEvents,
  TName
>;

// The player is a class generic over its events, so the map is named once here for TS
export function usePlayerEvent<TName extends IPlayerEventName>(
  player: MaybeRefOrGetter<VideoPlayer>,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): ComputedRef<IPlayerPayload<TName>> {
  const event = useEvent<IVideoPlayerEvents, TName>(player, name, initialValue);
  return computed(() => event.value ?? initialValue);
}

export function usePlayerEventOrNull<TName extends IPlayerEventName>(
  player: MaybeRefOrGetter<VideoPlayer>,
  name: TName,
) {
  return useEvent<IVideoPlayerEvents, TName>(player, name);
}
