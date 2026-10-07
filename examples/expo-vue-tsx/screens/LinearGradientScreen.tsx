import { computed, defineComponent, ref } from 'vue';
import { LinearGradient } from '@symbiote-native/linear-gradient/vue';
import type { ILinearGradientPoint } from '@symbiote-native/linear-gradient/vue';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.LinearGradient;
const color = lineColorOf(ROUTE);
const PHOTO_URI = 'https://picsum.photos/id/1018/640/360';
const PROGRESS_STEP = 20;

type IStops = readonly [string, string, ...string[]];
type IPreset = { name: string; colors: IStops };
type IDirection = { name: string; start: ILinearGradientPoint; end: ILinearGradientPoint };

const PRESETS: readonly IPreset[] = [
  { name: 'sunset', colors: ['#f97316', '#db2777', '#4c1d95'] },
  { name: 'ocean', colors: ['#22d3ee', '#2563eb'] },
  { name: 'mint', colors: ['#bbf7d0', '#14b8a6'] },
  { name: 'rainbow', colors: ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7'] },
];

const DIRECTIONS: readonly IDirection[] = [
  { name: 'down', start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { name: 'right', start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { name: 'diagonal', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { name: 'up', start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
];

const HORIZONTAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };

const HeroBannerScenario = defineComponent(
  () => () => (
    <Scenario
      testID="linear-gradient-banner-scenario"
      title="Give a promo banner or a profile header a branded background"
      why="A gradient is the cheapest way to make a flat card feel designed: onboarding heroes, plan cards and headers use two or three brand colors on a diagonal."
      steps={['Look at the banner', 'Rotate the device or compare a small and a large screen']}
      expect="The banner shows an orange to purple diagonal blend under the text. The text stays on top and readable, and the gradient stretches with the card."
    >
      <LinearGradient
        testID="linear-gradient-banner"
        colors={['#f97316', '#db2777', '#4c1d95']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        class="lg-banner"
      >
        <text class="lg-banner-title">Summer plan, 30% off</text>
        <text class="lg-banner-body">Children of this view paint above the gradient</text>
      </LinearGradient>
    </Scenario>
  ),
  { name: 'HeroBannerScenario' },
);

const ScrimScenario = defineComponent(
  () => () => (
    <Scenario
      testID="linear-gradient-scrim-scenario"
      title="Keep a caption readable over any photo"
      why="White text over a bright photo is unreadable. Cover the bottom of the picture with a transparent to black gradient, as feeds, galleries and video cards do."
      steps={['Wait for the photo to load', 'Read the caption at the bottom of it']}
      expect="The photo stays clear at the top and darkens smoothly towards the bottom, where the white caption is easy to read."
    >
      <view class="lg-photo-frame">
        <image testID="linear-gradient-scrim-photo" source={{ uri: PHOTO_URI }} class="lg-photo" />
        <LinearGradient
          testID="linear-gradient-scrim"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
          locations={[0.3, 1]}
          class="lg-scrim"
        >
          <text class="lg-caption">Mountain lake at dawn</text>
        </LinearGradient>
      </view>
    </Scenario>
  ),
  { name: 'ScrimScenario' },
);

const ProgressScenario = defineComponent(
  () => {
    const percent = ref(35);
    return () => (
      <Scenario
        testID="linear-gradient-progress-scenario"
        title="Draw a progress bar or a gradient button"
        why="Progress bars, level meters and call-to-action buttons use a short gradient strip whose width follows a value."
        steps={['Press +20% and -20% a few times', 'Press the gradient button']}
        expect="The filled strip grows and shrinks in 20% steps between 0% and 100%. The gradient button reacts to the press and fills the bar."
      >
        <view class="lg-track">
          <LinearGradient
            testID="linear-gradient-progress-fill"
            colors={['#22c55e', '#facc15', '#ef4444']}
            start={HORIZONTAL.start}
            end={HORIZONTAL.end}
            class="lg-fill"
            style={{ width: `${percent.value}%` }}
          />
        </view>
        <ResultRow testID="linear-gradient-progress-value" label="Progress" value={`${percent.value}%`} />
        <view class="button-row">
          <ActionButton testID="linear-gradient-progress-minus" title={`-${PROGRESS_STEP}%`} color={color} onPress={() => { percent.value = Math.max(0, percent.value - PROGRESS_STEP); }} />
          <ActionButton testID="linear-gradient-progress-plus" title={`+${PROGRESS_STEP}%`} color={color} onPress={() => { percent.value = Math.min(100, percent.value + PROGRESS_STEP); }} />
        </view>
        <pressable testID="linear-gradient-button" onPress={() => { percent.value = 100; }}>
          <LinearGradient colors={['#6366f1', '#a855f7']} start={HORIZONTAL.start} end={HORIZONTAL.end} class="lg-button">
            <text class="lg-button-text">Finish setup</text>
          </LinearGradient>
        </pressable>
      </Scenario>
    );
  },
  { name: 'ProgressScenario' },
);

// Every stop pulled into the first half of the line, so the last color fills the rest
function squeezedLocations([, , ...rest]: IStops): readonly [number, number, ...number[]] {
  const last = rest.length + 1;
  return [0, 0.5 / last, ...rest.map((_, index) => (0.5 * (index + 2)) / last)];
}

const PlaygroundCard = defineComponent(
  () => {
    const presetName = ref(PRESETS[0].name);
    const directionName = ref(DIRECTIONS[2].name);
    const isEvenlySpaced = ref(true);
    const isDithered = ref(true);
    const preset = computed(() => PRESETS.find(item => item.name === presetName.value) ?? PRESETS[0]);
    const direction = computed(() => DIRECTIONS.find(item => item.name === directionName.value) ?? DIRECTIONS[0]);

    return () => (
      <Explorer testID="linear-gradient-explorer" color={color}>
        <Card testID="linear-gradient-playground" title="Every prop">
          <LinearGradient
            testID="linear-gradient-playground-view"
            colors={preset.value.colors}
            locations={isEvenlySpaced.value ? null : squeezedLocations(preset.value.colors)}
            start={direction.value.start}
            end={direction.value.end}
            dither={isDithered.value}
            class="lg-playground"
          />
          <ChoiceRow testID="linear-gradient-preset" label="colors" color={color} value={presetName.value} options={PRESETS.map(item => ({ label: item.name, value: item.name }))} onChange={name => { presetName.value = name; }} />
          <ChoiceRow testID="linear-gradient-direction" label="start → end" color={color} value={directionName.value} options={DIRECTIONS.map(item => ({ label: item.name, value: item.name }))} onChange={name => { directionName.value = name; }} />
          <ToggleRow testID="linear-gradient-locations" label="locations: spread evenly (off = squeezed into the first half)" value={isEvenlySpaced.value} onChange={value => { isEvenlySpaced.value = value; }} color={color} />
          <ToggleRow testID="linear-gradient-dither" label="dither (Android only)" value={isDithered.value} onChange={value => { isDithered.value = value; }} color={color} />
        </Card>
      </Explorer>
    );
  },
  { name: 'PlaygroundCard' },
);

export const LinearGradientScreen = defineComponent(
  () => () => (
    <ScreenShell
      route={ROUTE}
      testID="linear-gradient-scroll"
      title="Linear Gradient"
      body="A native view that paints a multi-color blend behind its children. Used for banners, photo scrims, progress bars and buttons."
    >
      <HeroBannerScenario />
      <ScrimScenario />
      <ProgressScenario />
      <PlaygroundCard />
    </ScreenShell>
  ),
  { name: 'LinearGradientScreen' },
);
