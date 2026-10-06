import { useEvent } from '@symbiote-native/svelte/runes/use-event';
import type { IEventName, IEventPayload } from '@symbiote-native/engine';
import type {
  IUseVideoPlayerResult,
  IVideoPlayerEvents,
} from '@symbiote-native/video/svelte';

type IPlayerEventName = IEventName<IVideoPlayerEvents>;
type IPlayerPayload<TName extends IPlayerEventName> = IEventPayload<
  IVideoPlayerEvents,
  TName
>;

// The player is a class generic over its events, so the map is named once here for TS
export function usePlayerEvent<TName extends IPlayerEventName>(
  player: IUseVideoPlayerResult,
  name: TName,
  initialValue: IPlayerPayload<TName>,
): { readonly current: IPlayerPayload<TName> } {
  const event = useEvent<IVideoPlayerEvents, TName>(
    () => player.current,
    () => name,
    initialValue,
  );
  return {
    get current(): IPlayerPayload<TName> {
      return event.current ?? initialValue;
    },
  };
}

export function usePlayerEventOrNull<TName extends IPlayerEventName>(
  player: IUseVideoPlayerResult,
  name: TName,
): { readonly current: IPlayerPayload<TName> | null } {
  return useEvent<IVideoPlayerEvents, TName>(
    () => player.current,
    () => name,
  );
}
