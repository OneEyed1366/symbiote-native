import type { Ref } from 'react';
import type { IHostInstance } from '@symbiote-native/react';
import type {
  CSSAnimationProperties,
  CSSCallbackProps,
  CSSTransitionProperties,
} from 'react-native-reanimated';
import type {
  ILayoutAnimationBuilder,
  LayoutAnimationFunction,
} from 'react-native-reanimated/src/commonTypes';
import type { EntryOrExitLayoutType } from 'react-native-reanimated/src/helperTypes';
import type { ReanimatedKeyframe } from 'react-native-reanimated/src/layoutReanimation';
import type { AnimatedStyleHandle } from 'react-native-reanimated/src/hook/commonTypes';
import type { IAnimatedRef } from '../core/animated-ref';

// Any handle `useAnimatedStyle` or `useAnimatedProps` made, whatever it animates
type IAnimatedHandle = Pick<
  AnimatedStyleHandle<object>,
  'viewDescriptors' | 'styleUpdaterContainer'
>;

// The CSS animation and transition keys a style may carry next to the view's own
type ICssStyle = CSSAnimationProperties & CSSTransitionProperties;

type IStylePart<Style> =
  Style | IAnimatedHandle | ICssStyle | false | null | undefined;

// What `useEvent`, `useAnimatedScrollHandler` and `useComposedEventHandler` return
type IHandlerHolder = { readonly workletEventHandler: unknown };

// Every event prop also takes a worklet handler, as upstream's animated props do
type IWithHandlers<Props> = {
  [Key in keyof Props]: Key extends `on${string}`
    ? Props[Key] | IHandlerHolder
    : Props[Key];
};

// The props of a host tag, plus the animated style, the animated props and the animated ref
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IWithHandlers<Omit<Props, 'style' | 'ref'>> &
    CSSCallbackProps & {
      style?:
        | Props['style']
        | IAnimatedHandle
        | ICssStyle
        | readonly IStylePart<Props['style']>[];
      animatedProps?: IAnimatedHandle;
      entering?: EntryOrExitLayoutType;
      exiting?: EntryOrExitLayoutType;
      layout?:
        ILayoutAnimationBuilder | LayoutAnimationFunction | ReanimatedKeyframe;
      ref?: Ref<IHostInstance> | IAnimatedRef;
    };
