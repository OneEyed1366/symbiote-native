import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  polyfillWebCrypto,
  webCrypto,
} from '@symbiote-native/standard-web-crypto/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const RANDOM_BYTE_COUNT = 16;
const HEX_RADIX = 16;
const HEX_PAD_LENGTH = 2;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, '0'))
    .join(' ');
}

// `globalThis.crypto` is not a typed global without the DOM lib, so it is read untyped
function hasGlobalCrypto(): boolean {
  return Reflect.get(globalThis, 'crypto') !== undefined;
}

@Component({
  selector: 'WebCryptoScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="web-crypto-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Web Crypto</text>
            <text class="hero-body">
              Make web libraries that expect crypto.getRandomValues, such as
              uuid, nanoid or wallet libraries, work on React Native by
              installing it on globalThis.crypto over the native random source.
            </text>
          </view>
        </view>

        <Scenario
          testID="web-crypto-scenario"
          title="Run a web library that needs crypto.getRandomValues"
          why="Libraries like uuid and nanoid call the Web Crypto API and crash without it. One polyfill call at startup gives them secure random numbers from the native source."
          [steps]="scenarioSteps"
          expect="The installed row switches to Yes, and every press of the random bytes button shows 16 different values."
        />

        <view testID="web-crypto-random-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Random bytes</text>
          </view>
          <ActionButton
            testID="web-crypto-random-button"
            title="Generate 16 random bytes"
            [color]="lineColor"
            (press)="generateRandomBytes()"
          />
          @if (randomBytesHex(); as hex) {
            <ValueRow label="Bytes (hex)" [value]="hex" />
          }
        </view>

        <view testID="web-crypto-polyfill-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Polyfill</text>
          </view>
          <ActionButton
            testID="web-crypto-polyfill-button"
            title="Install polyfill"
            [color]="lineColor"
            (press)="installPolyfill()"
          />
          <ValueRow
            label="globalThis.crypto installed"
            [value]="isPolyfillInstalled() ? 'Yes' : 'No'"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class WebCryptoScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
  readonly lineColor = LINE_COLOR['standard-web-crypto'];
  readonly badgeStyle = { backgroundColor: LINE_COLOR['standard-web-crypto'] };
  readonly scenarioSteps = [
    'Press Install polyfill',
    'Check that globalThis.crypto is installed',
    'Generate random bytes',
  ];

  readonly randomBytesHex = signal<string | null>(null);
  readonly isPolyfillInstalled = signal(hasGlobalCrypto());

  generateRandomBytes(): void {
    const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
    this.randomBytesHex.set(toHex(bytes));
  }

  installPolyfill(): void {
    polyfillWebCrypto();
    this.isPolyfillInstalled.set(hasGlobalCrypto());
  }
}
