<script setup lang="ts">
import { computed, ref } from 'vue';
import { LinearGradient } from '@symbiote-native/linear-gradient/vue';
import type { ILinearGradientPoint } from '@symbiote-native/linear-gradient/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

type IStops = readonly [string, string, ...string[]];
type IPreset = { name: string; colors: IStops };
type IDirection = { name: string; start: ILinearGradientPoint; end: ILinearGradientPoint };

const ROUTE = ROUTE_NAME.LinearGradient;
const color = lineColorOf(ROUTE);
const PHOTO_SOURCE = { uri: 'https://picsum.photos/id/1018/640/360' };
const PROGRESS_STEP = 20;
const MINUS_TITLE = `-${PROGRESS_STEP}%`;
const PLUS_TITLE = `+${PROGRESS_STEP}%`;

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
const BANNER_COLORS = ['#f97316', '#db2777', '#4c1d95'];
const BANNER_START = { x: 0, y: 0 };
const BANNER_END = { x: 1, y: 1 };
const SCRIM_COLORS = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'];
const SCRIM_LOCATIONS = [0.3, 1];
const PROGRESS_COLORS = ['#22c55e', '#facc15', '#ef4444'];
const BUTTON_COLORS = ['#6366f1', '#a855f7'];
const PRESET_OPTIONS = PRESETS.map(item => ({ label: item.name, value: item.name }));
const DIRECTION_OPTIONS = DIRECTIONS.map(item => ({ label: item.name, value: item.name }));

const percent = ref(35);
const fillStyle = computed(() => ({ width: `${percent.value}%` }));
const percentLabel = computed(() => `${percent.value}%`);

const presetName = ref(PRESETS[0].name);
const directionName = ref(DIRECTIONS[2].name);
const isEvenlySpaced = ref(true);
const isDithered = ref(true);
const preset = computed(() => PRESETS.find(item => item.name === presetName.value) ?? PRESETS[0]);
const direction = computed(() => DIRECTIONS.find(item => item.name === directionName.value) ?? DIRECTIONS[0]);
const locations = computed(() => (isEvenlySpaced.value ? null : squeezedLocations(preset.value.colors)));

// Every stop pulled into the first half of the line, so the last color fills the rest
function squeezedLocations([, , ...rest]: IStops): readonly [number, number, ...number[]] {
  const last = rest.length + 1;
  return [0, 0.5 / last, ...rest.map((_, index) => (0.5 * (index + 2)) / last)];
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="linear-gradient-scroll"
    title="Linear Gradient"
    body="A native view that paints a multi-color blend behind its children. Used for banners, photo scrims, progress bars and buttons."
  >
    <Scenario
      testID="linear-gradient-banner-scenario"
      title="Give a promo banner or a profile header a branded background"
      why="A gradient is the cheapest way to make a flat card feel designed: onboarding heroes, plan cards and headers use two or three brand colors on a diagonal."
      :steps="['Look at the banner', 'Rotate the device or compare a small and a large screen']"
      expect="The banner shows an orange to purple diagonal blend under the text. The text stays on top and readable, and the gradient stretches with the card."
    >
      <LinearGradient
        testID="linear-gradient-banner"
        :colors="BANNER_COLORS"
        :start="BANNER_START"
        :end="BANNER_END"
        class="lg-banner"
      >
        <text class="lg-banner-title">
          Summer plan, 30% off
        </text>
        <text class="lg-banner-body">
          Children of this view paint above the gradient
        </text>
      </LinearGradient>
    </Scenario>

    <Scenario
      testID="linear-gradient-scrim-scenario"
      title="Keep a caption readable over any photo"
      why="White text over a bright photo is unreadable. Cover the bottom of the picture with a transparent to black gradient, as feeds, galleries and video cards do."
      :steps="['Wait for the photo to load', 'Read the caption at the bottom of it']"
      expect="The photo stays clear at the top and darkens smoothly towards the bottom, where the white caption is easy to read."
    >
      <view class="lg-photo-frame">
        <image
          testID="linear-gradient-scrim-photo"
          :source="PHOTO_SOURCE"
          class="lg-photo"
        />
        <LinearGradient
          testID="linear-gradient-scrim"
          :colors="SCRIM_COLORS"
          :locations="SCRIM_LOCATIONS"
          class="lg-scrim"
        >
          <text class="lg-caption">
            Mountain lake at dawn
          </text>
        </LinearGradient>
      </view>
    </Scenario>

    <Scenario
      testID="linear-gradient-progress-scenario"
      title="Draw a progress bar or a gradient button"
      why="Progress bars, level meters and call-to-action buttons use a short gradient strip whose width follows a value."
      :steps="['Press +20% and -20% a few times', 'Press the gradient button']"
      expect="The filled strip grows and shrinks in 20% steps between 0% and 100%. The gradient button reacts to the press and fills the bar."
    >
      <view class="lg-track">
        <LinearGradient
          testID="linear-gradient-progress-fill"
          :colors="PROGRESS_COLORS"
          :start="HORIZONTAL.start"
          :end="HORIZONTAL.end"
          class="lg-fill"
          :style="fillStyle"
        />
      </view>
      <ResultRow
        testID="linear-gradient-progress-value"
        label="Progress"
        :value="percentLabel"
      />
      <view class="button-row">
        <ActionButton
          testID="linear-gradient-progress-minus"
          :title="MINUS_TITLE"
          :color="color"
          @press="() => (percent = Math.max(0, percent - PROGRESS_STEP))"
        />
        <ActionButton
          testID="linear-gradient-progress-plus"
          :title="PLUS_TITLE"
          :color="color"
          @press="() => (percent = Math.min(100, percent + PROGRESS_STEP))"
        />
      </view>
      <pressable
        testID="linear-gradient-button"
        @press="percent = 100"
      >
        <LinearGradient
          :colors="BUTTON_COLORS"
          :start="HORIZONTAL.start"
          :end="HORIZONTAL.end"
          class="lg-button"
        >
          <text class="lg-button-text">
            Finish setup
          </text>
        </LinearGradient>
      </pressable>
    </Scenario>

    <Explorer
      testID="linear-gradient-explorer"
      :color="color"
    >
      <Card
        testID="linear-gradient-playground"
        title="Every prop"
      >
        <LinearGradient
          testID="linear-gradient-playground-view"
          :colors="preset.colors"
          :locations="locations"
          :start="direction.start"
          :end="direction.end"
          :dither="isDithered"
          class="lg-playground"
        />
        <ChoiceRow
          testID="linear-gradient-preset"
          label="colors"
          :color="color"
          :value="presetName"
          :options="PRESET_OPTIONS"
          @change="name => (presetName = name)"
        />
        <ChoiceRow
          testID="linear-gradient-direction"
          label="start → end"
          :color="color"
          :value="directionName"
          :options="DIRECTION_OPTIONS"
          @change="name => (directionName = name)"
        />
        <ToggleRow
          testID="linear-gradient-locations"
          label="locations: spread evenly (off = squeezed into the first half)"
          :value="isEvenlySpaced"
          @change="value => (isEvenlySpaced = value)"
          :color="color"
        />
        <ToggleRow
          testID="linear-gradient-dither"
          label="dither (Android only)"
          :value="isDithered"
          @change="value => (isDithered = value)"
          :color="color"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
