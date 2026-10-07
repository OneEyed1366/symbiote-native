// The every-primitive tour in Vue JSX, the same screen as in the other adapters
// Vue JSX compiles to createVNode calls, so every vnode recommits through the engine into Fabric
import { defineComponent, ref, shallowRef } from 'vue';
import type { IHostInstance } from '@symbiote-native/vue';
import { AccessibilityDemo } from '../components/AccessibilityDemo';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';
import { CompoundClassDemo } from '../components/CompoundClassDemo';
import { NativeModulesDemo } from '../components/NativeModulesDemo';
import { ParityDemo } from '../components/ParityDemo';
import { PlatformColorDemo } from '../components/PlatformColorDemo';
import { RefApiDemo } from '../components/RefApiDemo';
import { ResponderDemo } from '../components/ResponderDemo';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import { tunnelDemo } from '../tunnel-demo';
import { usePullRefresh } from './canary-hooks';
import { ACCENT, LOGO_URI } from './canary-shared';
import {
  CanaryCheckbox,
  CanaryCounter,
  CanaryGreeting,
  CanaryPressable,
  CanarySpinner,
  CanaryVolume,
} from './CanaryControls';
import { CanaryChips, CanaryMvcpList, CanaryRetentionCard } from './CanaryLists';
import { CanaryNativeButtons } from './CanaryNativeButtons';
import { CanaryModal, CanaryPortal, CanaryTunnel } from './CanaryOverlays';
import { CanaryRuntimeNotes } from './CanaryRuntimeNotes';
import { CanaryScrollHeader } from './CanaryScrollHeader';
import { CanaryStatusBar } from './CanaryStatusBar';
import { CanaryKeyboardAvoiding, CanaryStyleProps } from './CanaryStyleProps';

const CanaryHero = defineComponent({
  name: 'CanaryHero',
  setup() {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
    return () => (
      <>
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: ACCENT }}>
            <text class="hero-badge-text">CN</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">All primitives</text>
            <text class="hero-body">
              Every @symbiote-native/vue primitive, driven straight onto Fabric — no react-native
              renderer in the path.
            </text>
          </view>
        </view>
      </>
    );
  },
});

export const CanaryScreen = defineComponent({
  name: 'CanaryScreen',
  setup() {
    const count = ref(0);
    // shallowRef: the engine node is held by identity, so Teleport's target stays the real host node
    const overlayHost = shallowRef<IHostInstance | null>(null);
    const { isRefreshing, refreshes, onRefresh } = usePullRefresh();
    const tap = (): void => {
      count.value += 1;
    };
    return () => (
      <safe-area-view class="screen">
        <scroll-view testID="canary-scroll" class="screen" contentContainerStyle="scroll-content">
          <refresh-control refreshing={isRefreshing.value} onRefresh={onRefresh} tintColor={ACCENT} />
          <CanaryHero />
          <CanaryRuntimeNotes />
          <CanaryStatusBar />
          <CanaryNativeButtons />
          {/* The native spinner shows only while iOS holds the pull, so ours follows the flag */}
          {isRefreshing.value ? (
            <view class="refresh-row">
              <activity-indicator color={ACCENT} />
              <text class="accent-note">Refreshing…</text>
            </view>
          ) : (
            <text class="muted-center">{`pull to refresh · refreshed ${refreshes.value}×`}</text>
          )}
          <CanaryCounter count={count.value} onTap={tap} />
          <CanaryGreeting />
          <CanarySpinner />
          <CanaryCheckbox />
          <CanaryVolume />
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
          <CanaryPressable onTap={tap} />
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
          <CanaryPortal host={overlayHost.value} />
          <CanaryTunnel />
        </scroll-view>
        {/* The Teleport and tunnel target, a sibling of the scroll view on the same surface */}
        <view testID="overlay-host" ref={overlayHost} pointerEvents="box-none" class="overlay-host">
          <tunnelDemo.Out />
        </view>
      </safe-area-view>
    );
  },
});
