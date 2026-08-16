import type { IImageSourceProp, IResizeMode } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export type IHideConfig = {
  fade?: boolean;
};

export type IManifest = {
  background: string;
  darkBackground?: string;
  logo: {
    width: number;
    height: number;
  };
  brand?: {
    bottom: number;
    width: number;
    height: number;
  };
};

// The two RECOVERABLE points in the hide sequence, both of them runtime failures of a native
// module that does exist:
//   hide    - the native hide() call rejected.
//   animate - the caller's own fade-out threw.
// Neither is allowed to strand the app under a splash it can no longer dismiss, so each is
// reported and the sequence carries on. A `hide` failure means the native splash may still be up
// underneath the caller's fade-out. A MISSING native module is deliberately not on this list —
// that is a build error and it throws (see native-module.ts).
export type IHideAnimationFailureStage = 'hide' | 'animate';

export type IHideAnimationFailure = {
  stage: IHideAnimationFailureStage;
  error: unknown;
};

export type IHideAnimationConfig = {
  manifest: IManifest;
  ready?: boolean;

  logo?: IImageSourceProp;
  darkLogo?: IImageSourceProp;
  brand?: IImageSourceProp;
  darkBrand?: IImageSourceProp;

  animate: () => void;

  // The caller's only way to tell a nominal hide from a degraded one: `animate()` now runs in
  // both cases, so its firing no longer proves the native side succeeded.
  onError?: (failure: IHideAnimationFailure) => void;

  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
};

export type IHideAnimationContainerProps = {
  style: IStyleProp<IViewStyle>;
  onLayout: () => void;
};

export type IHideAnimationImageProps = {
  source: IImageSourceProp;
  fadeDuration?: number;
  resizeMode?: IResizeMode;
  style?: IStyleProp<IViewStyle>;
  onLoadEnd?: () => void;
};

export type IHideAnimationResult = {
  container: IHideAnimationContainerProps;
  logo: IHideAnimationImageProps;
  brand: IHideAnimationImageProps;
};

// Mirrors react-native-bootsplash's NativeRNBootSplash Spec.getConstants() return shape.
export type IHideAnimationConstants = {
  darkModeEnabled: boolean;
  logoSizeRatio?: number;
  navigationBarHeight?: number;
  statusBarHeight?: number;
};
