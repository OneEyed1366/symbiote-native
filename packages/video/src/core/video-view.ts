// Ядро `VideoView`: нативный view плеера, функции вызываются через `ViewPrototypes`
import {
  Platform,
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  defineExpoNativeViews,
  defineExpoViewMethods,
  getNativeTag,
  isDevBuild,
} from '@symbiote-native/engine';
import type {
  IExpoViewMethodCaller,
  ISymbioteNode,
} from '@symbiote-native/engine';
import { VIDEO_MODULE_NAME, VIDEO_VIEW_NAMES } from './constants';
import { expoVideo } from './native-module';

type IVideoViewKey = 'video' | 'surface' | 'texture';

const VIEW_NAMES = {
  video: VIDEO_VIEW_NAMES.video,
  surface: VIDEO_VIEW_NAMES.surface,
  texture: VIDEO_VIEW_NAMES.texture,
} as const satisfies Record<IVideoViewKey, string>;

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const views = defineExpoNativeViews(
  requireNativeViewManager,
  VIDEO_MODULE_NAME,
  VIEW_NAMES,
);

const callers: Record<IVideoViewKey, IExpoViewMethodCaller> = {
  video: defineExpoViewMethods(
    requireNativeModule,
    VIDEO_MODULE_NAME,
    VIEW_NAMES.video,
  ),
  surface: defineExpoViewMethods(
    requireNativeModule,
    VIDEO_MODULE_NAME,
    VIEW_NAMES.surface,
  ),
  texture: defineExpoViewMethods(
    requireNativeModule,
    VIDEO_MODULE_NAME,
    VIEW_NAMES.texture,
  ),
};

export type IVideoViewHandle = {
  /** Always shows the native controls */
  enterFullscreen(): Promise<void>;
  /** On Android it works only from a native listener, the JS runtime sleeps in fullscreen */
  exitFullscreen(): Promise<void>;
  /** Needs `supportsPictureInPicture` of the app setup, one player at a time */
  startPictureInPicture(): Promise<void>;
  stopPictureInPicture(): Promise<void>;
};

export type IVideoView = {
  handle: IVideoViewHandle;
  /** `null` means the view cannot register and the caller renders nothing */
  render(props: object): IDescriptor | null;
};

function viewKeyFor(surfaceType: unknown): IVideoViewKey {
  return Platform.select<IVideoViewKey>({
    android: surfaceType === 'textureView' ? 'texture' : 'surface',
    default: 'video',
  });
}

// The native view takes the id of the shared object, not the player itself
function playerIdOf(player: unknown): number | null {
  if (player instanceof expoVideo.VideoPlayer) {
    const id: unknown = Reflect.get(player, '__expo_shared_object_id__');
    return typeof id === 'number' ? id : null;
  }
  return typeof player === 'number' ? player : null;
}

/** One per mounted view, `getNode` answers the host node once it exists */
export function createVideoView(
  getNode: () => ISymbioteNode | null | undefined,
): IVideoView {
  let renderedKey = viewKeyFor(undefined);

  async function call(method: string): Promise<void> {
    const node = getNode();
    if (!node || getNativeTag(node) === undefined) return;
    await callers[renderedKey]<Promise<void>>(node, method, []);
  }

  return {
    handle: {
      enterFullscreen: () => call('enterFullscreen'),
      exitFullscreen: () => call('exitFullscreen'),
      startPictureInPicture: () => call('startPictureInPicture'),
      stopPictureInPicture: () => call('stopPictureInPicture'),
    },
    render: props => {
      renderedKey = viewKeyFor(Reflect.get(props, 'surfaceType'));
      const view = views[renderedKey];
      if (!view.ensureRegistered()) {
        if (isDevBuild()) console.warn("'VideoView' is not available.");
        return null;
      }
      return el(view.name(), {
        ...Object.fromEntries(Object.entries(props)),
        player: playerIdOf(Reflect.get(props, 'player')),
      });
    },
  };
}
