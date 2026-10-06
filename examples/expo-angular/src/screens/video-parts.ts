import { computed } from '@angular/core';
import type { Signal } from '@angular/core';
import { injectEvent } from '@symbiote-native/angular';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type {
  IVideoPlayerEvents,
  VideoPlayer,
} from '@symbiote-native/video/angular';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<
  IVideoPlayerEvents,
  TName
>;

// The player is a class generic over its events, so the map is named once here for TS
export function injectPlayerEvent<TName extends IPlayerEventName>(
  player: Signal<VideoPlayer>,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): Signal<IPlayerPayload<TName>> {
  const event = injectEvent<IVideoPlayerEvents, TName>(
    player,
    () => name,
    initialValue,
  );
  return computed(() => event() ?? initialValue);
}

export function injectPlayerEventOrNull<TName extends IPlayerEventName>(
  player: Signal<VideoPlayer>,
  name: TName,
): Signal<IPlayerPayload<TName> | null> {
  return injectEvent<IVideoPlayerEvents, TName>(player, () => name);
}
