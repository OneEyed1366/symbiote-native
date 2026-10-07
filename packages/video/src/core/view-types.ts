import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { VideoPlayer } from './player-types';

/** `fill` stretches the video, `cover` crops it, `contain` letterboxes it */
export type IVideoContentFit = 'contain' | 'cover' | 'fill';

/** Android only: `textureView` for overlapping views, `surfaceView` otherwise */
export type IVideoSurfaceType = 'textureView' | 'surfaceView';

/** Android only, which buttons the native controls show */
export type IVideoButtonOptions = {
  /** `false` by default */
  showNext?: boolean;
  /** `false` by default */
  showPrevious?: boolean;
  /** `true` by default */
  showSeekForward?: boolean;
  /** `true` by default */
  showSeekBackward?: boolean;
  /** `true` always, `false` never, `null` only when subtitles exist */
  showSubtitles?: boolean | null;
  /** `true` by default */
  showSettings?: boolean;
  /** `true` by default */
  showPlayPause?: boolean;
  /** `true` by default, fullscreen shows it anyway */
  showBottomBar?: boolean;
};

export type IVideoFullscreenOrientation =
  | 'default'
  | 'portrait'
  | 'portraitUp'
  | 'portraitDown'
  | 'landscape'
  | 'landscapeLeft'
  | 'landscapeRight';

export type IVideoKeepFullscreenOnPiPStop = 'always' | 'autoEnter' | 'never';

export type IVideoFullscreenOptions = {
  /** Shows the fullscreen button, `true` by default */
  enable: boolean;
  orientation?: IVideoFullscreenOrientation;
  /** Leaves fullscreen when the device turns away from `orientation` */
  autoExitOnRotate?: boolean;
  /** iOS only, `autoEnter` by default */
  keepFullscreenOnPiPStop?: IVideoKeepFullscreenOnPiPStop;
};

export type IVideoViewProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** From `useVideoPlayer` */
    player?: VideoPlayer | null;
    /** Always on in fullscreen, `true` by default */
    nativeControls?: boolean;
    /** `contain` by default */
    contentFit?: IVideoContentFit;
    fullscreenOptions?: IVideoFullscreenOptions;
    /** iOS only, `true` by default */
    showsTimecodes?: boolean;
    /** Forbids skipping, `false` by default */
    requiresLinearPlayback?: boolean;
    buttonOptions?: IVideoButtonOptions;
    /** Android only, must not change at runtime */
    surfaceType?: IVideoSurfaceType;
    /** iOS only, `{ dx: 0, dy: 0 }` by default */
    contentPosition?: { dx?: number; dy?: number };
    onPictureInPictureStart?: () => void;
    onPictureInPictureStop?: () => void;
    /** Needs `supportsPictureInPicture` of the app setup */
    allowsPictureInPicture?: boolean;
    /** Android 12+ and iOS, `false` by default */
    startsPictureInPictureAutomatically?: boolean;
    /** iOS 16+, `true` by default */
    allowsVideoFrameAnalysis?: boolean;
    onFullscreenEnter?: () => void;
    onFullscreenExit?: () => void;
    /** The first frame is rendered, also when the video track changes */
    onFirstFrameRender?: () => void;
    /** Android only, `false` by default */
    useExoShutter?: boolean;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

export type IVideoAirPlayButtonProps = IAccessibilityProps &
  IAriaProps & {
    /** The icon colour while AirPlay is not active */
    tint?: IColorValue;
    /** The icon colour while AirPlay is active */
    activeTint?: IColorValue;
    /** Lists the video outputs first, `true` by default */
    prioritizeVideoDevices?: boolean;
    onBeginPresentingRoutes?: () => void;
    onEndPresentingRoutes?: () => void;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };
