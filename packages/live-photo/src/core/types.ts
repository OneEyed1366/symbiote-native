import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

/**
 * A live photo asset
 *
 * The photo and the video must come from one unaltered live photo file, the pairing lives in
 * their metadata and native cannot rebuild it
 */
export type ILivePhotoAsset = {
  /** The URI of the photo part of the live photo */
  photoUri: string;
  /** The URI of the video part of the live photo */
  pairedVideoUri: string;
};

export type ILivePhotoLoadError = {
  /** Reason for the load failure */
  message: string;
};

/** `contain` fits the larger dimension to the target, `cover` fills the whole target */
export type ILivePhotoContentFit = 'contain' | 'cover';

/** `hint` plays a short part of the video, `full` plays all of it */
export type ILivePhotoPlaybackStyle = 'hint' | 'full';

export type ILivePhotoViewProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** The live photo asset to display */
    source?: ILivePhotoAsset | null;
    /** Whether the live photo plays without audio, `true` by default */
    isMuted?: boolean;
    /** `contain` by default */
    contentFit?: ILivePhotoContentFit;
    /** Playback starts on press and hold when `true`, which is the default */
    useDefaultGestureRecognizer?: boolean;
    onPlaybackStart?: () => void;
    onPlaybackStop?: () => void;
    onLoadStart?: () => void;
    /** The preview photo is loaded */
    onPreviewPhotoLoad?: () => void;
    /** The live photo is loaded and ready to play */
    onLoadComplete?: () => void;
    onLoadError?: (error: ILivePhotoLoadError) => void;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

/** What a ref to the view hands out */
export type ILivePhotoViewHandle = {
  /** Plays the video part, the full video unless `playbackStyle` says `hint` */
  startPlayback: (playbackStyle?: ILivePhotoPlaybackStyle) => void;
  stopPlayback: () => void;
};
