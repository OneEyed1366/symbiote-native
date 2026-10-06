<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { SymbolView, unstable_getMaterialSymbolSourceAsync } from '@symbiote-native/symbols/vue';
import type { IAnimationSpec, ISymbolType } from '@symbiote-native/symbols/vue';
import thin from '@symbiote-native/symbols/androidWeights/thin';
import light from '@symbiote-native/symbols/androidWeights/light';
import regular from '@symbiote-native/symbols/androidWeights/regular';
import medium from '@symbiote-native/symbols/androidWeights/medium';
import semiBold from '@symbiote-native/symbols/androidWeights/semiBold';
import bold from '@symbiote-native/symbols/androidWeights/bold';
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

const ROUTE = ROUTE_NAME.Symbols;
const color = lineColorOf(ROUTE);
const TAB_ICON_SIZE = 26;
const NO_EFFECT = 'none';
const PALETTE_TYPE: ISymbolType = 'palette';
const IDLE_TINT = '#64748b';
const LIKED_TINT = '#ef4444';
const PLAYGROUND_COLORS = ['#f97316', '#38bdf8', '#e2e8f0'];
const BOUNCE = { effect: { type: 'bounce' } } satisfies IAnimationSpec;
const IOS_ONLY = { ios: 'gearshape.fill' };
const ANDROID_ONLY = { android: 'settings' };
const STAR = { ios: 'star.fill', android: 'star' };
const WEATHER = { ios: 'cloud.sun.rain.fill', android: 'partly_cloudy_day' };

const TABS = [
  { label: 'Home', name: { ios: 'house.fill', android: 'home' } },
  { label: 'Search', name: { ios: 'magnifyingglass', android: 'search' } },
  { label: 'Alerts', name: { ios: 'bell.fill', android: 'notifications' } },
  { label: 'Profile', name: { ios: 'person.crop.circle.fill', android: 'person' } },
] as const;

const WEIGHTS = [
  { label: 'thin', ios: 'thin', android: thin },
  { label: 'light', ios: 'light', android: light },
  { label: 'regular', ios: 'regular', android: regular },
  { label: 'medium', ios: 'medium', android: medium },
  { label: 'semibold', ios: 'semibold', android: semiBold },
  { label: 'bold', ios: 'bold', android: bold },
] as const;

const TYPES: readonly ISymbolType[] = ['monochrome', 'hierarchical', PALETTE_TYPE, 'multicolor'];
const EFFECTS = [NO_EFFECT, 'bounce', 'pulse', 'scale'] as const;
type IEffectName = (typeof EFFECTS)[number];
const TYPE_OPTIONS = TYPES.map(item => ({ label: item, value: item }));
const EFFECT_OPTIONS = EFFECTS.map(item => ({ label: item, value: item }));
const SIZE_OPTIONS = [24, 48, 64, 96].map(item => ({ label: String(item), value: item }));

function animationOf(effect: IEffectName, isRepeating: boolean): IAnimationSpec | undefined {
  return effect === NO_EFFECT ? undefined : { effect: { type: effect }, repeating: isRepeating };
}

const active = ref<string>(TABS[0].label);
const liked = ref(false);
const plays = ref(0);
const source = ref<{ uri: string } | null>(null);
const sourceStatus = ref('rendering…');
const type = ref<ISymbolType>('hierarchical');
const effect = ref<IEffectName>('pulse');
const isRepeating = ref(true);
const size = ref(64);

const heartName = computed(() => ({ ios: liked.value ? 'heart.fill' : 'heart', android: 'favorite' }));
const heartTint = computed(() => (liked.value ? LIKED_TINT : IDLE_TINT));
const likedLabel = computed(() => String(liked.value));
const animation = computed(() => animationOf(effect.value, isRepeating.value));
const playgroundColors = computed(() => (type.value === PALETTE_TYPE ? PLAYGROUND_COLORS : undefined));

function tintOf(label: string): string {
  return label === active.value ? color : IDLE_TINT;
}

function like(): void {
  liked.value = !liked.value;
  plays.value += 1;
}

onMounted(async () => {
  try {
    const result = await unstable_getMaterialSymbolSourceAsync('home', 40, '#ffffff');
    source.value = result;
    sourceStatus.value = result === null ? 'null: iOS has no Material font path' : `${result.width}x${result.height}`;
  } catch (error) {
    sourceStatus.value = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
});
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="symbols-scroll"
    title="Symbols"
    body="System icons by name: SF Symbols on iOS, Material Symbols on Android. One name pair replaces icon files and icon-font setup."
  >
    <Scenario
      testID="symbols-tabs-scenario"
      title="Use system icons in a tab bar or a menu"
      why="One name pair gives the platform icon: an SF Symbol on iOS and a Material Symbol on Android. No icon files to export, and they scale and tint like text."
      :steps="['Press each tab in turn', 'Compare the icon shapes with the system apps on this device']"
      expect="The pressed tab icon and label turn to the accent color, the others stay grey. The icons look native to the platform."
    >
      <view
        testID="symbols-tabs"
        class="sym-tab-bar"
      >
        <pressable
          v-for="tab in TABS"
          :key="tab.label"
          :testID="`symbols-tab-${tab.label}`"
          class="sym-tab"
          @press="active = tab.label"
        >
          <SymbolView
            :name="tab.name"
            :size="TAB_ICON_SIZE"
            :tintColor="tintOf(tab.label)"
          >
            <template #fallback>
              <text>?</text>
            </template>
          </SymbolView>
          <text
            class="sym-tab-label"
            :style="{ color: tintOf(tab.label) }"
          >
            {{ tab.label }}
          </text>
        </pressable>
      </view>
      <ResultRow
        testID="symbols-active-tab"
        label="Selected tab"
        :value="active"
      />
    </Scenario>

    <Scenario
      testID="symbols-weight-scenario"
      title="Match icon weight to the text next to it"
      why="A thin icon beside bold text looks broken. Weight lets a row of icons follow the text weight of the design."
      :steps="['Look at the row from thin to bold', 'Compare the stroke thickness of the first and last icon']"
      expect="The strokes get visibly thicker from left to right, the sizes stay the same."
    >
      <view class="sym-weight-row">
        <view
          v-for="item in WEIGHTS"
          :key="item.label"
          class="sym-weight-cell"
        >
          <SymbolView
            :testID="`symbols-weight-${item.label}`"
            :name="STAR"
            :weight="{ ios: item.ios, android: item.android }"
            :size="30"
            :tintColor="color"
          />
          <text class="sym-weight-label">
            {{ item.label }}
          </text>
        </view>
      </view>
    </Scenario>

    <Scenario
      testID="symbols-animation-scenario"
      title="Make a like or a download button feel alive"
      why="A small bounce on press confirms the tap. SF Symbols animate natively, no animation code or Lottie file is needed (iOS 17 and later)."
      :steps="['Press the heart a few times']"
      expect="On iOS 17+ the heart bounces on every press and turns red or grey. On Android it only changes color."
    >
      <pressable
        testID="symbols-like"
        @press="like"
      >
        <SymbolView
          :key="plays"
          :name="heartName"
          :size="48"
          :tintColor="heartTint"
          :animationSpec="BOUNCE"
          class="sym-big"
        />
      </pressable>
      <ResultRow
        testID="symbols-like-state"
        label="Liked"
        :value="likedLabel"
      />
      <ActionButton
        testID="symbols-like-reset"
        title="Reset"
        :color="color"
        @press="liked = false"
      />
    </Scenario>

    <Scenario
      testID="symbols-fallback-scenario"
      title="Show something when a platform has no symbol"
      why="Some SF Symbols have no Material twin. With a name for one platform only, the fallback renders on the other instead of an empty gap."
      :steps="['Look at both rows on iOS, then on Android']"
      expect="The iOS-only symbol shows the gear on iOS and the text fallback on Android. The Android-only symbol shows its glyph on Android and the fallback on iOS."
    >
      <view class="capability-row">
        <text class="capability-label">
          name: only ios
        </text>
        <SymbolView
          testID="symbols-ios-only"
          :name="IOS_ONLY"
          :size="28"
          tintColor="#e2e8f0"
        >
          <template #fallback>
            <text class="value-text">
              no symbol here
            </text>
          </template>
        </SymbolView>
      </view>
      <view class="capability-row">
        <text class="capability-label">
          name: only android
        </text>
        <SymbolView
          testID="symbols-android-only"
          :name="ANDROID_ONLY"
          :size="28"
          tintColor="#e2e8f0"
        >
          <template #fallback>
            <text class="value-text">
              no symbol here
            </text>
          </template>
        </SymbolView>
      </view>
    </Scenario>

    <Card
      testID="symbols-source-card"
      title="Symbol as an image (Android)"
    >
      <text class="hero-body">
        For APIs that want an image, such as a native tab bar icon, a Material symbol can be rendered to an image source.
      </text>
      <ResultRow
        testID="symbols-source-status"
        label="unstable_getMaterialSymbolSourceAsync"
        :value="sourceStatus"
      />
      <image
        v-if="source !== null"
        testID="symbols-source-image"
        :source="source"
        class="sym-image-icon"
      />
    </Card>

    <Explorer
      testID="symbols-explorer"
      :color="color"
    >
      <Card
        testID="symbols-playground"
        title="Every prop"
      >
        <SymbolView
          testID="symbols-playground-view"
          :name="WEATHER"
          :type="type"
          :colors="playgroundColors"
          tintColor="#38bdf8"
          :size="size"
          scale="large"
          resizeMode="scaleAspectFit"
          :animationSpec="animation"
          class="sym-big"
        />
        <ChoiceRow
          testID="symbols-type"
          label="type (iOS)"
          :color="color"
          :value="type"
          :options="TYPE_OPTIONS"
          @change="value => (type = value)"
        />
        <ChoiceRow
          testID="symbols-effect"
          label="animationSpec.effect (iOS 17+)"
          :color="color"
          :value="effect"
          :options="EFFECT_OPTIONS"
          @change="value => (effect = value)"
        />
        <ToggleRow
          testID="symbols-repeating"
          label="animationSpec.repeating"
          :value="isRepeating"
          :color="color"
          @change="value => (isRepeating = value)"
        />
        <ChoiceRow
          testID="symbols-size"
          label="size"
          :color="color"
          :value="size"
          :options="SIZE_OPTIONS"
          @change="value => (size = value)"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
