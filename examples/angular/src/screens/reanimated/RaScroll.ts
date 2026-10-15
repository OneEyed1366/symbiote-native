import { Component } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
  type IAngularScrollViewProps,
} from '@symbiote-native/angular';
import {
  AnimatedScrollView,
  Extrapolation,
  interpolate,
  runOnUI,
  scrollTo,
  type IAnimatedHostProps,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useComposedEventHandler,
  useSharedValue,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';

const ROWS = Array.from({ length: 24 }, (_, index) => index);
const HEADER_FADE_AT = 120;
const MIN_SCALE = 0.6;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createScroll() {
  const scrollRef = useAnimatedRef();
  const offset = useSharedValue<number>(0);
  const scrolls = useSharedValue<number>(0);
  const drags = useSharedValue<number>(0);

  const counting = useAnimatedScrollHandler({
    onScroll: () => {
      'worklet';
      scrolls.value += 1;
    },
  });
  const dragging = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      drags.value += 1;
    },
  });
  const onScroll = useComposedEventHandler([counting, dragging]);

  const header = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(
        offset.value,
        [0, HEADER_FADE_AT],
        [1, 0.2],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            offset.value,
            [0, HEADER_FADE_AT],
            [1, MIN_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const counters = useAnimatedProps(() => {
    'worklet';
    return {
      text: `offset ${Math.round(offset.value)}, ${scrolls.value} scroll events, ${drags.value} drags`,
    };
  });

  const toTop = () => {
    runOnUI(() => {
      'worklet';
      scrollTo(scrollRef, 0, 0, true);
    })();
  };

  return {
    scrollRef,
    offset,
    onScroll,
    toTop,
    headerProps: { style: header },
    countersProps: { editable: false, animatedProps: counters },
  };
}

// The scroll position three ways: written to a shared value by the view itself, followed by an
// animated style, and counted by two handlers composed into one
@Component({
  selector: 'RaScroll',
  standalone: true,
  imports: [
    ActionButton,
    AnimatedScrollView,
    SYMBIOTE_ELEMENTS,
    SymbioteHostPropsDirective,
  ],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Scroll</text>
      <text class="ra-note"
        >scrollViewOffset, useAnimatedScrollHandler, useComposedEventHandler and
        scrollTo</text
      >
      <text-input
        testID="ra-scroll-counters"
        class="ra-readout"
        [symbioteHostProps]="scroll.countersProps"
      ></text-input>
      <view
        testID="ra-scroll-header"
        class="ra-header"
        [symbioteHostProps]="scroll.headerProps"
      ></view>
      <AnimatedScrollView
        [animatedRef]="scroll.scrollRef"
        [scrollViewOffset]="scroll.offset"
        [scrollViewProps]="scrollProps"
      >
        @for (row of rows; track row) {
          <view class="ra-item">
            <text class="ra-item-text">{{ 'row ' + row }}</text>
          </view>
        }
      </AnimatedScrollView>
      <ActionButton
        testID="ra-scroll-top"
        title="to top"
        [color]="accent"
        (press)="scroll.toTop()"
      />
    </view>
  `,
})
export class RaScroll {
  readonly scroll = createScroll();
  readonly rows = ROWS;
  readonly accent = ACCENT;
  // A prop that holds a worklet event handler goes in with the rest of the tag's props
  readonly scrollProps: IAnimatedHostProps<IAngularScrollViewProps> & {
    class: string;
  } = {
    testID: 'ra-scroll-view',
    class: 'ra-scroller',
    nestedScrollEnabled: true,
    onScroll: this.scroll.onScroll,
  };
}
