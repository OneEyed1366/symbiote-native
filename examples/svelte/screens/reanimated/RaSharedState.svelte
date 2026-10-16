<script module lang="ts">
  import { makeMutable } from '@symbiote-native/reanimated/svelte';
  import { createSynchronizable } from 'react-native-worklets';

  // Made at module load, outside any component, so nothing in Svelte owns its lifetime
  const clicks = makeMutable(0);
  const reads = createSynchronizable(0);
</script>

<script lang="ts">
  import {
    createAnimatedComponent,
    getViewProp,
    useAnimatedRef,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaBadge from './RaBadge.svelte';
  import RaSection from './RaSection.svelte';

  const GROWN = 1.4;
  const SMALL = 1;

  // Returns the component itself: every host tag already takes an animated style
  const AnimatedBadge = createAnimatedComponent(RaBadge);

  // A mutable and a synchronizable made outside Svelte, a component of ours animated, and a view
  // prop read back from the UI side
  let mutable = $state(clicks.value);
  let synchronizable = $state(reads.getBlocking());
  let opacity = $state('unread');
  const scale = useSharedValue<number>(SMALL);
  const badgeRef = useAnimatedRef();

  const grow = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ scale: scale.value }] };
  });

  const countMutable = () => {
    clicks.value += 1;
    mutable = clicks.value;
  };

  const countSynchronizable = () => {
    reads.setBlocking(previous => previous + 1);
    synchronizable = reads.getBlocking();
  };

  const growBadge = () => {
    scale.value = withSpring(scale.value === SMALL ? GROWN : SMALL);
  };

  const readOpacity = async () => {
    const tag = badgeRef.getTag();
    if (tag === null) return;
    const read = await getViewProp<number>(tag, 'opacity', badgeRef.current);
    opacity = String(read);
  };
</script>

<RaSection
  title="Shared state"
  note="makeMutable, createSynchronizable, createAnimatedComponent and getViewProp"
>
  <text class="ra-note">{`mutable: ${mutable}`}</text>
  <text class="ra-note">{`synchronizable: ${synchronizable}`}</text>
  <text class="ra-note">{`opacity: ${opacity}`}</text>
  <view class="ra-stage">
    <AnimatedBadge ref={badgeRef} style={grow} />
  </view>
  <view class="ra-wrap">
    <ActionButton
      testID="ra-shared-mutable"
      title="makeMutable +1"
      onPress={countMutable}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-shared-sync"
      title="synchronizable +1"
      onPress={countSynchronizable}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-shared-grow"
      title="grow badge"
      onPress={growBadge}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-shared-read"
      title="getViewProp"
      onPress={readOpacity}
      color={ACCENT}
    />
  </view>
</RaSection>
