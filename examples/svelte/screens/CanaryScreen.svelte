<script lang="ts">
  import { TunnelOut, createTunnel } from '@symbiote-native/svelte';
  import AccessibilityDemo from '../components/AccessibilityDemo.svelte';
  import AnimatedDemo from '../components/AnimatedDemo.svelte';
  import AnimatedParityDemo from '../components/AnimatedParityDemo.svelte';
  import CompoundClassDemo from '../components/CompoundClassDemo.svelte';
  import NativeModulesDemo from '../components/NativeModulesDemo.svelte';
  import ParityDemo from '../components/ParityDemo.svelte';
  import PlatformColorDemo from '../components/PlatformColorDemo.svelte';
  import RefApiDemo from '../components/RefApiDemo.svelte';
  import ResponderDemo from '../components/ResponderDemo.svelte';
  import { ROUTE_NAME } from '../routes';
  import { ROUTE_LINE_INFO } from '../navigation-lines';
  import CanaryChips from './CanaryChips.svelte';
  import CanaryControls from './CanaryControls.svelte';
  import CanaryKeyboardAvoiding from './CanaryKeyboardAvoiding.svelte';
  import CanaryModal from './CanaryModal.svelte';
  import CanaryMvcpList from './CanaryMvcpList.svelte';
  import CanaryNativeButtons from './CanaryNativeButtons.svelte';
  import CanaryPressable from './CanaryPressable.svelte';
  import CanaryRetentionCard from './CanaryRetentionCard.svelte';
  import CanaryRuntimeNotes from './CanaryRuntimeNotes.svelte';
  import CanaryScrollHeader from './CanaryScrollHeader.svelte';
  import CanaryStatusBar from './CanaryStatusBar.svelte';
  import CanaryStyleProps from './CanaryStyleProps.svelte';
  import CanaryTunnel from './CanaryTunnel.svelte';
  import { usePullRefresh } from './canary-hooks.svelte';
  import { ACCENT, LOGO_URI } from './canary-shared';

  // `TunnelIn` and `TunnelOut` share only this store, not a component instance
  const overlayTunnel = createTunnel();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  const pull = usePullRefresh();

  let count = $state(0);
</script>

<safe-area-view class="screen">
  <scroll-view testID="canary-scroll" class="screen" contentContainerStyle="scroll-content">
    <!-- A child, not a prop: the scroll behavior places it per platform -->
    <refresh-control p={{ refreshing: pull.isRefreshing, onRefresh: pull.onRefresh, tintColor: ACCENT }} />
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: ACCENT }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">All primitives</text>
        <!-- One physical line on purpose: Svelte keeps a wrapped sentence's newline in RCTText -->
        <text class="hero-body">
          Every @symbiote-native/svelte primitive, driven straight onto Fabric — no react-native renderer in the path.
        </text>
      </view>
    </view>
    <CanaryRuntimeNotes />
    <CanaryStatusBar />
    <CanaryNativeButtons />
    <!-- The native spinner shows only while iOS holds the pull, so ours follows the flag -->
    {#if pull.isRefreshing}
      <view class="refresh-row">
        <activity-indicator color={ACCENT} />
        <text class="accent-note">Refreshing…</text>
      </view>
    {:else}
      <text class="muted-center">{`pull to refresh · refreshed ${pull.refreshes}×`}</text>
    {/if}
    <view testID="counter-card" p={{ onPress: () => (count += 1) }} class="counter-card">
      <text testID="counter-value" class="counter-text">{`tapped ${count}×`}</text>
    </view>
    <CanaryControls />
    <AnimatedDemo />
    <AnimatedParityDemo />
    <NativeModulesDemo />
    <RefApiDemo />
    <PlatformColorDemo />
    <AccessibilityDemo />
    <ResponderDemo />
    <CompoundClassDemo />
    <ParityDemo />
    <CanaryModal />
    <CanaryPressable onTap={() => (count += 1)} />
    <CanaryChips />
    <CanaryRetentionCard />
    <CanaryMvcpList />
    <CanaryScrollHeader />
    <CanaryStyleProps />
    <CanaryKeyboardAvoiding />
    <image source={{ uri: LOGO_URI }} class="logo-image" />
    <view class="bottom-card">
      <text class="bottom-text">↑ you scrolled to the bottom</text>
    </view>
    <CanaryTunnel tunnel={overlayTunnel} />
  </scroll-view>
  <!-- The tunnel target, empty and persistent, box-none lets touches through to the scroll view -->
  <view testID="overlay-host" pointerEvents="box-none" class="overlay-host">
    <TunnelOut tunnel={overlayTunnel} />
  </view>
</safe-area-view>
