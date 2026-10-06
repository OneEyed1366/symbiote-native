<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from '@symbiote-native/glass-effect/vue';
import type { IGlassColorScheme, IGlassStyle } from '@symbiote-native/glass-effect/vue';
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

type IStyleName = IGlassStyle;

const ROUTE = ROUTE_NAME.GlassEffect;
const color = lineColorOf(ROUTE);
const PHOTO_SOURCE = { uri: 'https://picsum.photos/id/1043/640/420' };
const MERGE_STEP = 14;
const STYLES: readonly IStyleName[] = ['regular', 'clear', 'none'];
const SCHEMES: readonly IGlassColorScheme[] = ['auto', 'light', 'dark'];
const STYLE_OPTIONS = STYLES.map(item => ({ label: item, value: item }));
const SCHEME_OPTIONS = SCHEMES.map(item => ({ label: item, value: item }));
const LIQUID_AVAILABLE = String(isLiquidGlassAvailable());
const API_AVAILABLE = String(isGlassEffectAPIAvailable());
const LIKE_TINT = 'rgba(255, 59, 48, 0.7)';
const PANEL_TINT = 'rgba(10, 132, 255, 0.5)';

const liked = ref(false);
const likeLabel = computed(() => (liked.value ? 'Liked' : 'Like'));
const likeState = computed(() => (liked.value ? 'on' : 'off'));
const likeTint = computed(() => (liked.value ? LIKE_TINT : undefined));

const gap = ref(60);
const gapStyle = computed(() => ({ marginRight: gap.value }));
const gapLabel = computed(() => String(gap.value));

const style = ref<IStyleName>('regular');
const scheme = ref<IGlassColorScheme>('auto');
const isAnimated = ref(true);
const isTinted = ref(false);
const effectStyle = computed(() =>
  isAnimated.value ? { style: style.value, animate: true, animationDuration: 0.6 } : style.value,
);
const panelTint = computed(() => (isTinted.value ? PANEL_TINT : undefined));

function closer(): void {
  gap.value = Math.max(4, gap.value - MERGE_STEP);
}

function farther(): void {
  gap.value = Math.min(60, gap.value + MERGE_STEP);
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="glass-effect-scroll"
    title="Glass Effect"
    body="iOS 26 Liquid Glass as native views: floating controls, merging shapes and tinted surfaces. On Android and older iOS the same code renders plain views."
  >
    <Card
      testID="glass-availability-card"
      title="Is Liquid Glass here?"
    >
      <ResultRow
        testID="glass-liquid-available"
        label="isLiquidGlassAvailable()"
        :value="LIQUID_AVAILABLE"
      />
      <ResultRow
        testID="glass-api-available"
        label="isGlassEffectAPIAvailable()"
        :value="API_AVAILABLE"
      />
      <text class="hero-body">
        Both are true only on iOS 26 and later. Everywhere else the components render a plain view without the glass, so check
        before relying on the look.
      </text>
    </Card>

    <Scenario
      testID="glass-toolbar-scenario"
      title="Float tinted action buttons over a photo"
      why="Camera, maps and media apps put round or pill controls on top of content. Liquid Glass lets the content shine through and lights up under the finger."
      :steps="['Press and hold a glass pill without lifting', 'Press Like and look at its tint']"
      expect="On iOS 26 the pills are see-through glass that reacts to the touch, and Like turns red. On other systems they are plain views with the same text."
    >
      <view class="glass-frame">
        <image
          testID="glass-photo"
          :source="PHOTO_SOURCE"
          class="glass-photo"
        />
        <GlassContainer
          testID="glass-toolbar"
          :spacing="12"
          class="glass-toolbar"
        >
          <GlassView
            testID="glass-share"
            :isInteractive="true"
            glassEffectStyle="regular"
            class="glass-pill"
          >
            <text class="glass-pill-text">
              Share
            </text>
          </GlassView>
          <pressable
            testID="glass-like-press"
            @press="liked = !liked"
          >
            <GlassView
              testID="glass-like"
              :isInteractive="true"
              glassEffectStyle="clear"
              :tintColor="likeTint"
              class="glass-pill"
            >
              <text class="glass-pill-text">
                {{ likeLabel }}
              </text>
            </GlassView>
          </pressable>
        </GlassContainer>
      </view>
      <ResultRow
        testID="glass-like-state"
        label="Like state"
        :value="likeState"
      />
      <ActionButton
        testID="glass-like-reset"
        title="Reset"
        :color="color"
        @press="liked = false"
      />
    </Scenario>

    <Scenario
      testID="glass-merge-scenario"
      title="Let nearby glass shapes melt into one"
      why="Inside a GlassContainer the effect treats close elements as one liquid surface, the way the iOS 26 toolbar groups buttons. The spacing value is the distance at which they start to merge."
      :steps="['Press Closer until the gap is 4', 'Press Farther until the gap is 60 again']"
      expect="On iOS 26 the two bubbles stretch toward each other and join into one blob when the gap drops below 40, then separate again. Elsewhere they only move."
    >
      <view class="glass-frame">
        <image
          :source="PHOTO_SOURCE"
          class="glass-photo"
        />
        <GlassContainer
          testID="glass-merge-container"
          :spacing="40"
          class="glass-merge-row"
        >
          <GlassView
            testID="glass-merge-left"
            class="glass-bubble"
            :style="gapStyle"
          >
            <text class="glass-bubble-text">
              ＋
            </text>
          </GlassView>
          <GlassView
            testID="glass-merge-right"
            class="glass-bubble"
          >
            <text class="glass-bubble-text">
              ♥
            </text>
          </GlassView>
        </GlassContainer>
      </view>
      <ResultRow
        testID="glass-merge-gap"
        label="gap"
        :value="gapLabel"
      />
      <view class="button-row">
        <ActionButton
          testID="glass-merge-closer"
          title="Closer"
          :color="color"
          @press="closer"
        />
        <ActionButton
          testID="glass-merge-farther"
          title="Farther"
          :color="color"
          @press="farther"
        />
      </view>
    </Scenario>

    <Explorer
      testID="glass-explorer"
      :color="color"
    >
      <Card
        testID="glass-playground"
        title="Every prop"
      >
        <view class="glass-frame">
          <image
            :source="PHOTO_SOURCE"
            class="glass-photo"
          />
          <GlassView
            testID="glass-playground-view"
            :glassEffectStyle="effectStyle"
            :colorScheme="scheme"
            :tintColor="panelTint"
            :isInteractive="true"
            class="glass-panel"
          >
            <text class="glass-panel-text">
              Change the style below: with animate on, the change takes 0.6 s
            </text>
          </GlassView>
        </view>
        <ChoiceRow
          testID="glass-style"
          label="glassEffectStyle"
          :color="color"
          :value="style"
          :options="STYLE_OPTIONS"
          @change="value => (style = value)"
        />
        <ChoiceRow
          testID="glass-scheme"
          label="colorScheme (overrides the system)"
          :color="color"
          :value="scheme"
          :options="SCHEME_OPTIONS"
          @change="value => (scheme = value)"
        />
        <ToggleRow
          testID="glass-animate"
          label="animate style changes"
          :value="isAnimated"
          :color="color"
          @change="value => (isAnimated = value)"
        />
        <ToggleRow
          testID="glass-tint"
          label="tintColor (blue)"
          :value="isTinted"
          :color="color"
          @change="value => (isTinted = value)"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
