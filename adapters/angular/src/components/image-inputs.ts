// The input and output names of `Animated.Image`, kept apart from the prop fold so the list reads
// as one table

export const IMAGE_INPUTS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'style',
  'resizeMode',
  'resizeMethod',
  'resizeMultiplier',
  'tintColor',
  'blurRadius',
  'capInsets',
  'fadeDuration',
  'progressiveRenderingEnabled',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
  'testID',
  'nativeID',
  'accessible',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLabelledBy',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'screenReaderFocusable',
  'accessibilityViewIsModal',
  'accessibilityElementsHidden',
  'accessibilityIgnoresInvertColors',
  'accessibilityLanguage',
  'accessibilityRespondsToUserInteraction',
  'accessibilityShowsLargeContentViewer',
  'accessibilityLargeContentTitle',
  'role',
  'ariaLabel: aria-label',
  'ariaLabelledBy: aria-labelledby',
  'ariaLive: aria-live',
  'ariaHidden: aria-hidden',
  'ariaBusy: aria-busy',
  'ariaChecked: aria-checked',
  'ariaDisabled: aria-disabled',
  'ariaExpanded: aria-expanded',
  'ariaSelected: aria-selected',
  'ariaModal: aria-modal',
  'ariaValueMax: aria-valuemax',
  'ariaValueMin: aria-valuemin',
  'ariaValueNow: aria-valuenow',
  'ariaValueText: aria-valuetext',
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
  'onLoadStart',
  'onLoad',
  'onLoadEnd',
  'onError',
  'onProgress',
  'onPartialLoad',
];

type IImageOutput =
  | 'accessibilityAction'
  | 'accessibilityTap'
  | 'magicTap'
  | 'accessibilityEscape'
  | 'loadStart'
  | 'load'
  | 'loadEnd'
  | 'error'
  | 'progress'
  | 'partialLoad';

export const IMAGE_OUTPUTS: IImageOutput[] = [
  'accessibilityAction',
  'accessibilityTap',
  'magicTap',
  'accessibilityEscape',
  'loadStart',
  'load',
  'loadEnd',
  'error',
  'progress',
  'partialLoad',
];
