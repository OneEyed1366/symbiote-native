<script lang="ts">
  // Transitions & Animations section. This whole category is essentially all No here —
  // `transition:`/`in:`/`out:`/`animate:` and every built-in (fade/fly/slide/scale/draw/
  // crossfade/flip) are legal only on a raw element (never reachable from app code) and, even
  // inside this adapter's own source, are on the explicit forbidden list: no DOM layout box to
  // animate from/to, and `Animated` (core/engine) + `{@attach}` is the sanctioned replacement —
  // AnimatedDemo.svelte/AnimatedParityDemo.svelte on CanaryScreen already show that path.
  //
  // The one Yes row: `svelte/easing` itself is pure math (cubic-bezier/elastic/etc curve
  // functions), no DOM dependency, and stays usable standalone as an easing config even with the
  // directives that normally consume it dead here.
  import { cubicInOut, elasticOut, linear } from 'svelte/easing';
  import { Text, View } from '@symbiote-native/svelte';
  import ActionButton from '../ActionButton.svelte';

  const ACCENT = '#5ec8f2';
  const SAMPLE_COUNT = 12;
  const BAR_MAX_WIDTH = 200;

  type IEasingCurve = { name: string; fn: (t: number) => number };
  const CURVES: readonly IEasingCurve[] = [
    { name: 'linear', fn: linear },
    { name: 'cubicInOut', fn: cubicInOut },
    { name: 'elasticOut', fn: elasticOut },
  ];

  let curveIndex = $state(0);
  const curve = $derived(CURVES[curveIndex]);
  const samples = $derived(
    Array.from({ length: SAMPLE_COUNT }, (_unused, index) => {
      const t = index / (SAMPLE_COUNT - 1);
      return { t, value: curve.fn(t) };
    }),
  );

  function nextCurve(): void {
    curveIndex = (curveIndex + 1) % CURVES.length;
  }
</script>

<View class="section-nested">
  <Text class="section-label">
    Transitions & Animations · svelte/easing (the one Yes row)
  </Text>
  <ActionButton
    testID="easing-next-curve"
    title="Next curve"
    color={ACCENT}
    onPress={nextCurve}
  />
  <Text class="info-text" testID="easing-curve-name">
    {`curve: ${curve.name}`}
  </Text>
  {#each samples as sample (sample.t)}
    <View class="row-align-center" style={{ height: 14 }}>
      <View
        style={{
          width: Math.max(2, sample.value * BAR_MAX_WIDTH),
          height: 8,
          borderRadius: 4,
          backgroundColor: ACCENT,
        }}
      />
    </View>
  {/each}
  <Text class="note-text">
    No — transition:/in:/out:/animate: and every built-in curve consumer are
    dead (no DOM box to animate, and forbidden even in adapter source); Animated
    + {'{@attach}'} is the sanctioned replacement — see CanaryScreen's AnimatedDemo.
  </Text>
</View>
