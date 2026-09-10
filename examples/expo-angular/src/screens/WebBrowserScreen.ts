import { Component, signal } from '@angular/core';
import {
  Platform,
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  TextInputElement,
  View,
} from '@symbiote-native/angular';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  mayInitWithUrlAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_URL = 'https://symbiote-native.dev';

/**
 * @symbiote-native/web-browser canary demo: open a URL in the in-app browser and render the
 * result type it resolves with, plus the Android-only Custom Tabs service surface.
 *
 * The two platforms answer differently and both answers are shown as-is: iOS presents
 * SFSafariViewController and resolves only once it closes ('cancel', or 'dismiss' when
 * dismissBrowser closed it), Android launches a Custom Tab and resolves 'opened' immediately,
 * never reporting the close.
 */
@Component({
  selector: 'WebBrowserScreen',
  standalone: true,
  imports: [
    ActionButton,
    SafeAreaViewElement,
    ScrollViewElement,
    Text,
    TextInputElement,
    View,
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="web-browser-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Web Browser</text>
            <text class="hero-body">
              @symbiote-native/web-browser — an in-app browser
              (SFSafariViewController on iOS, Custom Tabs on Android) that keeps
              the user inside the app, unlike Linking.openURL.
            </text>
          </view>
        </view>

        <view testID="web-browser-open-card" class="web-browser-card">
          <text class="web-browser-card-title">Open a URL</text>
          <text-input
            testID="web-browser-url-input"
            class="text-input"
            placeholder="https://…"
            placeholderTextColor="#41506a"
            [value]="url()"
            (valueChange)="url.set($event)"
          ></text-input>
          <ActionButton
            testID="web-browser-open-button"
            title="Open"
            (press)="handleOpen()"
            [color]="lineColor"
          ></ActionButton>
          @if (Platform.OS === 'ios') {
            <ActionButton
              testID="web-browser-dismiss-button"
              title="Dismiss"
              (press)="handleDismiss()"
              [color]="lineColor"
            ></ActionButton>
            <text class="web-browser-note">
              The presented browser covers the app, so Dismiss is only reachable
              once the browser is already gone — it then reports that no browser
              was presented.
            </text>
          } @else {
            <text class="web-browser-note">
              Android has no dismiss: a Custom Tab runs in its own task and
              cannot be closed programmatically, so dismissBrowser throws off
              iOS.
            </text>
          }
        </view>

        <view testID="web-browser-result-card" class="web-browser-card">
          <text class="web-browser-card-title">Last result</text>
          <view class="web-browser-row">
            <text class="web-browser-row-label">Open</text>
            <text
              testID="web-browser-open-result"
              class="web-browser-value-text"
            >
              {{ openResult() }}
            </text>
          </view>
          <view class="web-browser-row">
            <text class="web-browser-row-label">Dismiss</text>
            <text
              testID="web-browser-dismiss-result"
              class="web-browser-value-text"
            >
              {{ dismissResult() }}
            </text>
          </view>
        </view>

        @if (Platform.OS === 'android') {
          <view testID="web-browser-service-card" class="web-browser-card">
            <text class="web-browser-card-title">Custom Tabs service</text>
            <text class="web-browser-note">
              Android only. Warming the service up before a known URL makes the
              tab open faster; cool it down when you are done.
              getCustomTabsSupportingBrowsersAsync throws on iOS, which has no
              such concept, so this whole card is behind the platform check.
            </text>
            <view class="button-row">
              <ActionButton
                testID="web-browser-warm-up-button"
                title="Warm up"
                (press)="handleWarmUp()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="web-browser-may-init-button"
                title="May init"
                (press)="handleMayInit()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="web-browser-cool-down-button"
                title="Cool down"
                (press)="handleCoolDown()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="web-browser-browsers-button"
                title="List browsers"
                (press)="handleListBrowsers()"
                [color]="lineColor"
              ></ActionButton>
            </view>
            <view class="web-browser-row">
              <text class="web-browser-row-label">Service package</text>
              <text
                testID="web-browser-service-package"
                class="web-browser-value-text"
              >
                {{ servicePackage() }}
              </text>
            </view>
            <view class="web-browser-row">
              <text class="web-browser-row-label">Supporting browsers</text>
              <text
                testID="web-browser-browsers"
                class="web-browser-value-text"
              >
                {{ browsers() }}
              </text>
            </view>
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class WebBrowserScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.WebBrowser];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  readonly url = signal(DEMO_URL);
  readonly openResult = signal('idle');
  readonly dismissResult = signal('idle');
  readonly servicePackage = signal('(not warmed up)');
  readonly browsers = signal('(not queried)');

  handleOpen(): void {
    this.openResult.set('opening…');
    openBrowserAsync(this.url())
      .then(result => this.openResult.set(result.type))
      .catch((error: Error) => this.openResult.set(`failed: ${error.message}`));
  }

  handleDismiss(): void {
    dismissBrowser()
      .then(result => this.dismissResult.set(result.type))
      .catch((error: Error) =>
        this.dismissResult.set(`failed: ${error.message}`),
      );
  }

  handleWarmUp(): void {
    warmUpAsync()
      .then(result =>
        this.servicePackage.set(
          result.servicePackage ?? '(no service package)',
        ),
      )
      .catch((error: Error) =>
        this.servicePackage.set(`failed: ${error.message}`),
      );
  }

  // Hints the warmed-up service at the URL about to be opened; the package it reports back is the
  // one warmUpAsync picked, which is why that button comes first.
  handleMayInit(): void {
    mayInitWithUrlAsync(this.url())
      .then(result =>
        this.servicePackage.set(
          result.servicePackage ?? '(no service package)',
        ),
      )
      .catch((error: Error) =>
        this.servicePackage.set(`failed: ${error.message}`),
      );
  }

  handleCoolDown(): void {
    coolDownAsync()
      .then(() => this.servicePackage.set('(cooled down)'))
      .catch((error: Error) =>
        this.servicePackage.set(`failed: ${error.message}`),
      );
  }

  handleListBrowsers(): void {
    this.browsers.set('querying…');
    getCustomTabsSupportingBrowsersAsync()
      .then(result =>
        this.browsers.set(
          result.browserPackages.length === 0
            ? '(none installed)'
            : result.browserPackages.join(', '),
        ),
      )
      .catch((error: Error) => this.browsers.set(`failed: ${error.message}`));
  }
}
