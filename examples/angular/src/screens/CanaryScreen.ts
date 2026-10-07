import { Component, OnInit, signal } from '@angular/core';
import {
  PortalOutletDirective,
  SYMBIOTE_ELEMENTS,
  TunnelOut,
} from '@symbiote-native/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
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
import { CanaryCounter, CanaryControls } from './CanaryControls';
import {
  CanaryChips,
  CanaryMvcpList,
  CanaryRetentionCard,
} from './CanaryLists';
import { CanaryNativeButtons } from './CanaryNativeButtons';
import { CanaryModal, CanaryPortal, CanaryTunnel } from './CanaryOverlays';
import { CanaryPressable } from './CanaryPressable';
import { CanaryRuntimeNotes } from './CanaryRuntimeNotes';
import { CanaryScrollHeader } from './CanaryScrollHeader';
import { CanaryStatusBar } from './CanaryStatusBar';
import { CanaryKeyboardAvoiding, CanaryStyleProps } from './CanaryStyleProps';
import { ACCENT, LOGO_URI, REFRESH_MS, overlayTunnel } from './canary-shared';

@Component({
  selector: 'CanaryScreen',
  standalone: true,
  imports: [
    AccessibilityDemo,
    AnimatedDemo,
    AnimatedParityDemo,
    CanaryChips,
    CanaryControls,
    CanaryCounter,
    CanaryKeyboardAvoiding,
    CanaryModal,
    CanaryMvcpList,
    CanaryNativeButtons,
    CanaryPortal,
    CanaryPressable,
    CanaryRetentionCard,
    CanaryRuntimeNotes,
    CanaryScrollHeader,
    CanaryStatusBar,
    CanaryStyleProps,
    CanaryTunnel,
    CompoundClassDemo,
    NativeModulesDemo,
    ParityDemo,
    PlatformColorDemo,
    PortalOutletDirective,
    RefApiDemo,
    ResponderDemo,
    SYMBIOTE_ELEMENTS,
    TunnelOut,
  ],
  template: `
    <safe-area-view testID="angular-safe-area" class="screen">
      <scroll-view
        testID="angular-canary-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <refresh-control
          testID="angular-refresh-control"
          [refreshing]="isRefreshing()"
          [onRefresh]="onRefresh"
          [tintColor]="accent"
        />
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view testID="angular-hero" class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">CN</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">All primitives</text>
            <text class="hero-body">
              Every @symbiote-native/angular primitive, driven straight onto
              Fabric — no react-native renderer in the path.
            </text>
          </view>
        </view>
        <CanaryRuntimeNotes />
        <CanaryStatusBar />
        <CanaryNativeButtons />
        <CanaryCounter [count]="count()" (tap)="increment()" />
        <CanaryControls />
        <AnimatedDemo></AnimatedDemo>
        <AnimatedParityDemo></AnimatedParityDemo>
        <NativeModulesDemo></NativeModulesDemo>
        <RefApiDemo></RefApiDemo>
        <PlatformColorDemo></PlatformColorDemo>
        <AccessibilityDemo></AccessibilityDemo>
        <ResponderDemo></ResponderDemo>
        <CompoundClassDemo></CompoundClassDemo>
        <ParityDemo></ParityDemo>
        <CanaryPressable (tap)="increment()" />
        <CanaryChips />
        <CanaryRetentionCard />
        <CanaryMvcpList />
        <CanaryScrollHeader />
        <CanaryStyleProps />
        <CanaryKeyboardAvoiding />
        <image [src]="logoUri" alt="Angular logo" class="logo-image" />
        <view class="bottom-card">
          <text class="bottom-text">↑ you scrolled to the bottom</text>
        </view>
        <CanaryModal />
        <CanaryPortal [host]="overlayHost" />
        <CanaryTunnel />
        <image-background
          testID="angular-image-bg"
          [src]="logoUri"
          alt="Angular image background"
          resizeMode="cover"
          class="image-background"
          imageStyle="image-background-image"
        >
          <text testID="angular-image-bg-label" class="image-background-label">
            Angular children paint on top of the image
          </text>
        </image-background>
      </scroll-view>

      <!-- The portal and tunnel target, a sibling of the scroll view on the same surface -->
      <view
        testID="angular-overlay-host"
        pointerEvents="box-none"
        class="overlay-host"
      >
        <ng-container portalOutlet #overlayHost="portalOutlet"></ng-container>
        <tunnel-out [tunnel]="tunnel" />
      </view>
    </safe-area-view>
  `,
})
export class CanaryScreen implements OnInit {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: ACCENT };
  readonly accent = ACCENT;
  readonly logoUri = LOGO_URI;
  readonly tunnel = overlayTunnel;

  readonly count = signal(0);
  readonly isRefreshing = signal(false);

  readonly increment = (): void => this.count.update(value => value + 1);

  readonly onRefresh = (): void => {
    this.isRefreshing.set(true);
    setTimeout(() => this.isRefreshing.set(false), REFRESH_MS);
  };

  ngOnInit(): void {
    hide();
  }
}
