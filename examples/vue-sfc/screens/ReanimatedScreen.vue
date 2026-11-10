<script setup lang="ts">
import AnimationsSection from './reanimated/AnimationsSection.vue';
import CssSection from './reanimated/CssSection.vue';
import DerivedSection from './reanimated/DerivedSection.vue';
import EnteringExitingSection from './reanimated/EnteringExitingSection.vue';
import FramesSection from './reanimated/FramesSection.vue';
import LayoutTransitionSection from './reanimated/LayoutTransitionSection.vue';
import ListSection from './reanimated/ListSection.vue';
import MeasureSection from './reanimated/MeasureSection.vue';
import ParitySection from './reanimated/ParitySection.vue';
import ScrollSection from './reanimated/ScrollSection.vue';
import SharedStateSection from './reanimated/SharedStateSection.vue';
import SharedTransitionSection from './reanimated/SharedTransitionSection.vue';
import TransformOriginSection from './reanimated/TransformOriginSection.vue';
import WorkletsSection from './reanimated/WorkletsSection.vue';
import './reanimated/keyframes.css';
import './reanimated/sections.css';

// Everything react-native-reanimated 4.7.1 does, one section each, on the UI thread
// The last section checks the package's exports against the list
</script>

<template>
  <safe-area-view class="ra-screen">
    <scroll-view class="ra-scroll" content-container-style="ra-content">
      <text class="ra-title">Reanimated</text>
      <AnimationsSection />
      <DerivedSection />
      <EnteringExitingSection />
      <LayoutTransitionSection />
      <TransformOriginSection />
      <ScrollSection />
      <ListSection />
      <FramesSection />
      <CssSection />
      <WorkletsSection />
      <SharedStateSection />
      <SharedTransitionSection />
      <MeasureSection />
      <ParitySection />
    </scroll-view>
  </safe-area-view>
</template>
