<script lang="ts">
  import Reanimated, {
    Extrapolation,
    interpolate,
    runOnUI,
    scrollTo,
    useAnimatedProps,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useComposedEventHandler,
    useSharedValue,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaSection from './RaSection.svelte';

  const ROWS = Array.from({ length: 24 }, (_, index) => index);
  const HEADER_FADE_AT = 120;
  const MIN_SCALE = 0.6;

  // The scroll position three ways: written to a shared value by the view itself, followed by an
  // animated style, and counted by two handlers composed into one
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
</script>

<RaSection
  title="Scroll"
  note="scrollViewOffset, useAnimatedScrollHandler, useComposedEventHandler and scrollTo"
>
  <text-input
    testID="ra-scroll-counters"
    class="ra-readout"
    editable={false}
    p={{ animatedProps: counters }}
  />
  <view testID="ra-scroll-header" class="ra-header" style={header} />
  <Reanimated.ScrollView
    ref={scrollRef}
    testID="ra-scroll-view"
    class="ra-scroller"
    scrollViewOffset={offset}
    nestedScrollEnabled
    {onScroll}
  >
    {#each ROWS as row (row)}
      <view class="ra-item">
        <text class="ra-item-text">{`row ${row}`}</text>
      </view>
    {/each}
  </Reanimated.ScrollView>
  <ActionButton
    testID="ra-scroll-top"
    title="to top"
    onPress={toTop}
    color={ACCENT}
  />
</RaSection>
