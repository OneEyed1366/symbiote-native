import Animated, {
  Extrapolation,
  interpolate,
  runOnUI,
  scrollTo,
  TextInput,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useComposedEventHandler,
  useSharedValue,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const ROWS = Array.from({ length: 24 }, (_, index) => index);
const HEADER_FADE_AT = 120;
const MIN_SCALE = 0.6;
const TOP_COLOR = '#4ea1ff';

// The scroll position three ways: written to a shared value by the view itself, followed by an
// animated style, and counted by two handlers composed into one
export function ScrollSection() {
  const scrollRef = useAnimatedRef();
  const offset = useSharedValue<number>(0);
  const scrolls = useSharedValue<number>(0);
  const drags = useSharedValue<number>(0);

  const counting = useAnimatedScrollHandler({
    onScroll: () => {
      scrolls.value += 1;
    },
  });
  const dragging = useAnimatedScrollHandler({
    onBeginDrag: () => {
      drags.value += 1;
    },
  });
  const onScroll = useComposedEventHandler([counting, dragging]);

  const header = useAnimatedStyle(() => ({
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
  }));

  const counters = useAnimatedProps(() => ({
    text: `offset ${Math.round(offset.value)}, ${scrolls.value} scroll events, ${drags.value} drags`,
  }));

  const toTop = () => {
    runOnUI(() => {
      'worklet';
      scrollTo(scrollRef, 0, 0, true);
    })();
  };

  return (
    <Section
      title="Scroll"
      note="scrollViewOffset, useAnimatedScrollHandler, useComposedEventHandler and scrollTo"
    >
      <TextInput
        testID="ra-scroll-counters"
        className="ra-readout"
        editable={false}
        animatedProps={counters}
      />
      <Animated.View
        testID="ra-scroll-header"
        className="ra-header"
        style={header}
      />
      <Animated.ScrollView
        ref={scrollRef}
        testID="ra-scroll-view"
        className="ra-scroller"
        scrollViewOffset={offset}
        onScroll={onScroll}
      >
        {ROWS.map(row => (
          <view key={row} className="ra-item">
            <text className="ra-item-text">{`row ${row}`}</text>
          </view>
        ))}
      </Animated.ScrollView>
      <ActionButton
        testID="ra-scroll-top"
        title="to top"
        onPress={toTop}
        color={TOP_COLOR}
      />
    </Section>
  );
}
