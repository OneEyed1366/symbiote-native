import { useState } from 'react';
import type { IHostInstance } from '@symbiote-native/react';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';
import { NativeModulesDemo } from '../components/NativeModulesDemo';
import { RefApiDemo } from '../components/RefApiDemo';
import { PlatformColorDemo } from '../components/PlatformColorDemo';
import { AccessibilityDemo } from '../components/AccessibilityDemo';
import { ResponderDemo } from '../components/ResponderDemo';
import { CompoundClassDemo } from '../components/CompoundClassDemo';
import { ParityDemo } from '../components/ParityDemo';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { usePullRefresh } from './canary-hooks';
import { overlayTunnel } from './canary-shared';
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

const COLOR = LINE_COLOR.primitives;
const LOGO_URI = 'https://reactnative.dev/img/tiny_logo.png';

function CanaryHero() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  return (
    <>
      <view className="line-tag line-tag-primitives">
        <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
      </view>
      <view className="hero-card">
        <view className="hero-badge" style={{ backgroundColor: COLOR }}>
          <text className="hero-badge-text">CN</text>
        </view>
        <view className="hero-copy">
          <text className="hero-title">All primitives</text>
          <text className="hero-body">
            Every @symbiote-native/react primitive, driven straight onto Fabric — no react-native
            renderer in the path.
          </text>
        </view>
      </view>
    </>
  );
}

// The native spinner only shows while iOS holds the scroll view pulled down, so ours follows the flag
function RefreshStatus({ isRefreshing, refreshes }: { isRefreshing: boolean; refreshes: number }) {
  if (!isRefreshing) {
    return <text className="muted-center">{`pull to refresh · refreshed ${refreshes}×`}</text>;
  }
  return (
    <view className="refresh-row">
      <activity-indicator color={COLOR} />
      <text className="accent-note">Refreshing…</text>
    </view>
  );
}

// Every primitive here comes from @symbiote-native/react, drawn by our own host config onto Fabric.
// Run with DEBUG=1 to watch each interaction commit incrementally in Metro's logs
export function CanaryScreen() {
  const [count, setCount] = useState(0);
  // A ref callback, not useRef: refs attach after render, so .current is null on the first one
  const [overlayHost, setOverlayHost] = useState<IHostInstance | null>(null);
  const { isRefreshing, refreshes, onRefresh } = usePullRefresh();
  const tap = () => setCount(value => value + 1);
  return (
    <safe-area-view className="screen">
      <scroll-view testID="canary-scroll" className="screen" contentContainerStyle="scroll-content">
        {/* A child, not a prop: the scroll behavior places it per platform */}
        <refresh-control refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLOR} />
        <CanaryHero />
        <CanaryRuntimeNotes />
        <CanaryStatusBar />
        <CanaryNativeButtons />
        <RefreshStatus isRefreshing={isRefreshing} refreshes={refreshes} />
        <CanaryCounter count={count} onTap={tap} />
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
        <image source={{ uri: LOGO_URI }} className="logo-image" />
        <view className="bottom-card">
          <text className="bottom-text">↑ you scrolled to the bottom</text>
        </view>
        <CanaryPortal host={overlayHost} />
        <CanaryTunnel />
      </scroll-view>
      {/* The portal and tunnel target, a sibling of the scroll view on the same surface */}
      <view testID="overlay-host" ref={setOverlayHost} pointerEvents="box-none" className="overlay-host">
        <overlayTunnel.Out />
      </view>
    </safe-area-view>
  );
}
