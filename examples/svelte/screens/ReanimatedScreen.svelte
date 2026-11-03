<script lang="ts">
  import AnimationsSection from './reanimated/AnimationsSection.svelte';
  import CssSection from './reanimated/CssSection.svelte';
  import DerivedSection from './reanimated/DerivedSection.svelte';
  import EnteringExitingSection from './reanimated/EnteringExitingSection.svelte';
  import FramesSection from './reanimated/FramesSection.svelte';
  import LayoutTransitionSection from './reanimated/LayoutTransitionSection.svelte';
  import ListSection from './reanimated/ListSection.svelte';
  import MeasureSection from './reanimated/MeasureSection.svelte';
  import ParitySection from './reanimated/ParitySection.svelte';
  import ScrollSection from './reanimated/ScrollSection.svelte';
  import SharedStateSection from './reanimated/SharedStateSection.svelte';
  import SharedTransitionSection from './reanimated/SharedTransitionSection.svelte';
  import TransformOriginSection from './reanimated/TransformOriginSection.svelte';
  import WorkletsSection from './reanimated/WorkletsSection.svelte';
  import './reanimated/keyframes.css';
  import './reanimated/sections.css';

  // Everything react-native-reanimated 4.7.1 does, one section each, on the UI thread
  // The last section checks the package's exports against the list
</script>

<safe-area-view class="ra-screen">
  <scroll-view class="ra-scroll" contentContainerStyle="ra-content">
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
