import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  ISymbioteNode,
  IViewStyle,
} from '@symbiote-native/engine';

export type IGLObject = {
  id: number;
};

export type IGLSurfaceCreateEvent = {
  nativeEvent: {
    exglCtxId: number;
  };
};

export type IGLSnapshotOptions = {
  /** @default false */
  flip?: boolean;
  /** Defaults to the framebuffer shown in the view, or the current one of a headless context */
  framebuffer?: WebGLFramebuffer;
  /** Passed to `glReadPixels` */
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** PNG is lossless but slower, iOS writes a PNG instead of WebP. @default 'jpeg' */
  format?: 'jpeg' | 'png' | 'webp';
  /** From `0` (most compressed) to `1.0` (none). @default 1.0 */
  compress?: number;
};

export type IGLSnapshot = {
  uri: string | Blob | null;
  /** Same as `uri`, which makes a snapshot usable in `texImage2D` */
  localUri: string;
  width: number;
  height: number;
};

export type IExpoWebGLRenderingContext = WebGL2RenderingContext & {
  contextId: number;
  endFrameEXP(): void;
  flushEXP(): void;
  __expoSetLogging(option: GLLoggingOption): void;
};

/** A native tag, or the host node of a view such as a camera */
export type IGLNodeOrTag = number | ISymbioteNode | null;

export type IGLViewProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
    /** Called with the context once the surface exists */
    onContextCreate(gl: IExpoWebGLRenderingContext): void;
    /** Multisampling, `0` turns it off. @default 4 @platform ios */
    msaaSamples?: number;
    /** Lets the Reanimated worklet thread use the `gl` object. @default false */
    enableExperimentalWorkletSupport?: boolean;
  };

export enum GLLoggingOption {
  DISABLED = 0,
  /** Logs calls, their parameters and results */
  METHOD_CALLS = 1,
  /** Calls `getError` after each call, which blocks and slows drawing down */
  GET_ERRORS = 2,
  /** Prints the name of the constant a numeric parameter holds */
  RESOLVE_CONSTANTS = 4,
  /** Cuts long strings such as shaders */
  TRUNCATE_STRINGS = 8,
  ALL = METHOD_CALLS | GET_ERRORS | RESOLVE_CONSTANTS | TRUNCATE_STRINGS,
}

/** What a ref to the view hands out */
export type IGLViewHandle = {
  /** The id of the context of the view, `undefined` until the surface exists */
  readonly exglCtxId: number | undefined;
  createCameraTextureAsync(camera: IGLNodeOrTag): Promise<WebGLTexture>;
  destroyObjectAsync(glObject: IGLObject): Promise<boolean>;
  /** A snapshot of the context of this view */
  takeSnapshotAsync(options?: IGLSnapshotOptions): Promise<IGLSnapshot>;
};
