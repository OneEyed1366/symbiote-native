<script lang="ts">
  import {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaSection from './RaSection.svelte';

  const TURN_DEGREES = 45;
  const TURN_MS = 800;

  const ORIGINS = [
    'center',
    'top left',
    'top right',
    'bottom right',
    'bottom left',
    '25% 25%',
    '50px 100%',
  ] as const;

  type IOrigin = (typeof ORIGINS)[number];

  const idOf = (origin: IOrigin) => origin.replace(/[^a-z0-9]+/g, '-');

  // The same turn around a different point each time: the origin is part of the animated style
  const progress = useSharedValue(0);
  const origin = useSharedValue<IOrigin>('center');
  let picked = $state<IOrigin>('center');

  const turn = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          rotate: `${interpolate(progress.value, [0, 1], [0, TURN_DEGREES])}deg`,
        },
      ],
      transformOrigin: origin.value,
    };
  });

  const pick = (next: IOrigin) => {
    origin.value = next;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: TURN_MS,
      easing: Easing.out(Easing.exp),
    });
    picked = next;
  };
</script>

<RaSection
  title="Transform origin"
  note="the box turns 45 degrees around the point you pick"
>
  <view class="ra-stage">
    <view testID="ra-origin-box" class="ra-box" style={turn} />
  </view>
  <text class="ra-note">{`origin: ${picked}`}</text>
  <view class="ra-wrap">
    {#each ORIGINS as next (next)}
      <ActionButton
        testID={`ra-origin-${idOf(next)}`}
        title={next}
        onPress={() => pick(next)}
        color={ACCENT}
      />
    {/each}
  </view>
</RaSection>
