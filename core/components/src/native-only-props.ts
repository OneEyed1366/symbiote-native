// Свойства `Text` и `ScrollView` из `.d.ts` RN, которые движок отдаёт native как есть
// Логики у них нет, нужен только тип, общий для всех адаптеров

import type { IKeyboardEvent } from '@symbiote-native/engine';

export type ITextNativeOnlyProps = {
  dynamicTypeRamp?:
    | 'caption2'
    | 'caption1'
    | 'footnote'
    | 'subheadline'
    | 'callout'
    | 'body'
    | 'headline'
    | 'title3'
    | 'title2'
    | 'title1'
    | 'largeTitle';
  lineBreakStrategyIOS?: 'none' | 'standard' | 'hangul-word' | 'push-out';
  lineBreakMode?: 'head' | 'middle' | 'tail' | 'clip';
  textBreakStrategy?: 'simple' | 'highQuality' | 'balanced';
  dataDetectorType?: null | 'phoneNumber' | 'link' | 'email' | 'none' | 'all';
  android_hyphenationFrequency?: 'normal' | 'none' | 'full';
};

export type IScrollViewNativeOnlyProps = {
  automaticallyAdjustContentInsets?: boolean;
  automaticallyAdjustsScrollIndicatorInsets?: boolean;
  canCancelContentTouches?: boolean;
  scrollToOverflowEnabled?: boolean;
  scrollsToTop?: boolean;
  scrollsChildToFocus?: boolean;
  scrollPerfTag?: string;
  onScrollAnimationEnd?: () => void;
  // Not native: the ScrollView behavior fires these off `Keyboard`, as RN's ScrollView does
  onKeyboardWillShow?: (event: IKeyboardEvent) => void;
  onKeyboardWillHide?: (event: IKeyboardEvent) => void;
  onKeyboardDidShow?: (event: IKeyboardEvent) => void;
  onKeyboardDidHide?: (event: IKeyboardEvent) => void;
};
