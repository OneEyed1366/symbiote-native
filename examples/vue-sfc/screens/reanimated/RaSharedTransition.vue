<script setup lang="ts">
import { computed, ref } from 'vue';
import Reanimated, {
  FadeOutRight,
  SharedTransitionBoundary,
  SlideInDown,
} from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { ACCENT } from './constants';

const SHARED_TAG = 'demo-shared-box';
const FIRST = 'first';
const SECOND = 'second';

type IScreen = typeof FIRST | typeof SECOND;

// Two fake screens in one view: no navigator is needed when a boundary says which one is active
// The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in `package.json`
const showing = ref<IScreen>(FIRST);
const showingNote = computed(() => `showing: ${showing.value}`);
const isFirstActive = computed(() => showing.value === FIRST);
const isSecondShown = computed(() => showing.value === SECOND);

const toggle = () => {
  showing.value = showing.value === FIRST ? SECOND : FIRST;
};
</script>

<template>
  <RaSection
    title="Shared element transition"
    note="the box flies from the first fake screen to the second, turning on the way"
  >
    <text class="ra-note">{{ showingNote }}</text>
    <view class="ra-fake-screen">
      <SharedTransitionBoundary :isActive="isFirstActive">
        <Reanimated.View
          :sharedTransitionTag="SHARED_TAG"
          class="ra-box ra-shared-first"
        />
      </SharedTransitionBoundary>
    </view>
    <Reanimated.View
      v-if="isSecondShown"
      :entering="SlideInDown"
      :exiting="FadeOutRight"
      class="ra-fake-screen"
    >
      <SharedTransitionBoundary :isActive="isSecondShown">
        <Reanimated.View
          :sharedTransitionTag="SHARED_TAG"
          class="ra-box ra-shared-second"
        />
      </SharedTransitionBoundary>
    </Reanimated.View>
    <ActionButton
      testID="ra-shared-toggle"
      title="toggle screen"
      :onPress="toggle"
      :color="ACCENT"
    />
  </RaSection>
</template>
