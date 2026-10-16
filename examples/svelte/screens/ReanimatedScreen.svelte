<script lang="ts">
  import RaAnimations from './reanimated/RaAnimations.svelte';
  import RaCss from './reanimated/RaCss.svelte';
  import RaDerived from './reanimated/RaDerived.svelte';
  import RaEnteringExiting from './reanimated/RaEnteringExiting.svelte';
  import RaFrames from './reanimated/RaFrames.svelte';
  import RaLayoutTransitions from './reanimated/RaLayoutTransitions.svelte';
  import RaList from './reanimated/RaList.svelte';
  import RaMeasure from './reanimated/RaMeasure.svelte';
  import RaParity from './reanimated/RaParity.svelte';
  import RaScroll from './reanimated/RaScroll.svelte';
  import RaSharedState from './reanimated/RaSharedState.svelte';
  import RaSharedTransition from './reanimated/RaSharedTransition.svelte';
  import RaTransformOrigin from './reanimated/RaTransformOrigin.svelte';
  import RaWorklets from './reanimated/RaWorklets.svelte';
  import './reanimated/keyframes.css';
  import './reanimated/sections.css';

  // Everything react-native-reanimated 4.7.1 does, one section each, running on the UI thread over
  // the native half of Reanimated. The last section checks the package's exports against the list
</script>

<safe-area-view class="ra-screen">
  <scroll-view class="ra-scroll" contentContainerStyle="ra-content">
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
