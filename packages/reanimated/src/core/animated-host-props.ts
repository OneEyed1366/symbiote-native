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
import type { SharedTransition } from 'react-native-reanimated/src/layoutReanimation/SharedTransition';
import type { AnimatedStyleHandle } from 'react-native-reanimated/src/hook/commonTypes';

// Any handle `useAnimatedStyle` or `useAnimatedProps` made, whatever it animates
type IAnimatedHandle = Pick<
  AnimatedStyleHandle<object>,
  'viewDescriptors' | 'styleUpdaterContainer'
>;

// `animatedProps` takes one handle or any nesting of them in arrays
type INestedHandles = IAnimatedHandle | readonly INestedHandles[];

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

// What an animated host tag takes on top of its own props, in every adapter. The `ref` is left to
// the adapter, as a ref is the framework's own
export type IAnimatedHostBase<Props extends { style?: unknown }> =
  IWithHandlers<Omit<Props, 'style' | 'ref'>> &
    CSSCallbackProps & {
      style?:
        | Props['style']
        | IAnimatedHandle
        | ICssStyle
        | readonly IStylePart<Props['style']>[];
      animatedProps?: INestedHandles;
      entering?: EntryOrExitLayoutType;
      exiting?: EntryOrExitLayoutType;
      layout?:
        ILayoutAnimationBuilder | LayoutAnimationFunction | ReanimatedKeyframe;
      // Two nodes with one tag, one leaving and one arriving, fly into each other
      sharedTransitionTag?: string;
      sharedTransitionStyle?: SharedTransition;
    };
