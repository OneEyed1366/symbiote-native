<script setup lang="ts">
import RaAnimations from './reanimated/RaAnimations.vue';
import RaCss from './reanimated/RaCss.vue';
import RaDerived from './reanimated/RaDerived.vue';
import RaEnteringExiting from './reanimated/RaEnteringExiting.vue';
import RaFrames from './reanimated/RaFrames.vue';
import RaLayoutTransitions from './reanimated/RaLayoutTransitions.vue';
import RaList from './reanimated/RaList.vue';
import RaMeasure from './reanimated/RaMeasure.vue';
import RaParity from './reanimated/RaParity.vue';
import RaScroll from './reanimated/RaScroll.vue';
import RaSharedState from './reanimated/RaSharedState.vue';
import RaSharedTransition from './reanimated/RaSharedTransition.vue';
import RaTransformOrigin from './reanimated/RaTransformOrigin.vue';
import RaWorklets from './reanimated/RaWorklets.vue';
import './reanimated/keyframes.css';
import './reanimated/sections.css';

// Everything react-native-reanimated 4.7.1 does, one section each, running on the UI thread over
// the native half of Reanimated. The last section checks the package's exports against the list
</script>

<template>
  <safe-area-view class="ra-screen">
    <scroll-view class="ra-scroll" content-container-style="ra-content">
      <text class="ra-title">Reanimated</text>
      <RaAnimations />
      <RaDerived />
      <RaEnteringExiting />
      <RaLayoutTransitions />
      <RaTransformOrigin />
      <RaScroll />
      <RaList />
      <RaFrames />
      <RaCss />
      <RaWorklets />
      <RaSharedState />
      <RaSharedTransition />
      <RaMeasure />
      <RaParity />
    </scroll-view>
  </safe-area-view>
</template>
