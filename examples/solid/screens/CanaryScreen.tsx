// The every-primitive tour, the same screen as in the other adapters
// The Solid rules its sections obey are in .claude/rules/solid-descriptor-bridge.md
import { Show, createSignal } from 'solid-js';
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
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { createPullRefresh } from './canary-hooks';
import { LOGO_URI } from './canary-shared';
import {
  CanaryCheckbox,
  CanaryCounter,
  CanaryGreeting,
  CanaryPressable,
  CanarySpinner,
  CanaryVolume,
} from './CanaryControls';
import { CanaryChips, CanaryFillProbe, CanaryMvcpList, CanaryRetentionCard } from './CanaryLists';
import { CanaryModal } from './CanaryModal';
import { CanaryNativeButtons } from './CanaryNativeButtons';
import { CanaryRuntimeNotes } from './CanaryRuntimeNotes';
import { CanaryScrollHeader } from './CanaryScrollHeader';
import { CanaryStatusBar } from './CanaryStatusBar';
import { CanaryKeyboardAvoiding, CanaryStyleProps } from './CanaryStyleProps';
import './CanaryScreen.css';

const COLOR = LINE_COLOR.primitives;

function CanaryHero() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  return (
    <>
      <view class="line-tag line-tag-primitives">
        <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" style={{ backgroundColor: COLOR }}>
          <text class="hero-badge-text">CN</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">All primitives</text>
          <text class="hero-body">
            Every @symbiote-native/solid primitive, driven straight onto Fabric — no react-native
            renderer in the path.
          </text>
        </view>
      </view>
    </>
  );
}

export function CanaryScreen() {
  const [count, setCount] = createSignal(0);
  const { isRefreshing, refreshes, onRefresh } = createPullRefresh();
  const tap = (): void => setCount(value => value + 1);
  return (
    <safe-area-view class="screen">
      <scroll-view testID="canary-scroll" class="screen" contentContainerStyle="scroll-content">
        <refresh-control refreshing={isRefreshing()} onRefresh={onRefresh} tintColor={COLOR} />
        <CanaryHero />
        <CanaryRuntimeNotes />
        <CanaryStatusBar />
        <CanaryNativeButtons />
        {/* The native spinner shows only while iOS holds the pull, so ours follows the flag */}
        <Show
          when={isRefreshing()}
          fallback={<text class="muted-center">{`pull to refresh · refreshed ${refreshes()}×`}</text>}
        >
          <view class="refresh-row">
            <activity-indicator color={COLOR} />
            <text class="accent-note">Refreshing…</text>
          </view>
        </Show>
        <CanaryCounter count={count()} onTap={tap} />
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
        <CanaryFillProbe />
        <CanaryRetentionCard />
        <CanaryMvcpList />
        <CanaryScrollHeader />
        <CanaryStyleProps />
        <CanaryKeyboardAvoiding />
        <image source={{ uri: LOGO_URI }} class="logo-image" />
        <view class="bottom-card">
          <text class="bottom-text">↑ you scrolled to the bottom</text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
