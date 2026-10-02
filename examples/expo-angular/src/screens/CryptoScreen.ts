import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const DIGEST_SAMPLE_STRING = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

@Component({
  selector: 'CryptoScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="crypto-scroll"
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
            <text class="hero-title">Crypto</text>
            <text class="hero-body">
              Generate secure random bytes and unique ids, and hash strings with
              SHA or MD algorithms, using the platform's native cryptography
              instead of JavaScript code.
            </text>
          </view>
        </view>

        <Scenario
          testID="crypto-scenario"
          title="Create unique ids, tokens and checksums"
          why="Use a random UUID as an idempotency key, random bytes as a nonce or session secret, and a digest to verify that a file or a password input is unchanged."
          [steps]="scenarioSteps"
          expect="Every UUID and byte string differs, while the same text always gives the same SHA-256 digest. Known test vectors match the published values."
        />

        <view testID="crypto-uuid-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Random UUID</text>
          </view>
          <ActionButton
            testID="crypto-uuid-button"
            title="Generate UUID"
            [color]="lineColor"
            (press)="uuid.set(newUuid())"
          />
          @if (uuid(); as value) {
            <ValueRow label="UUID" [value]="value" />
          }
        </view>

        <view testID="crypto-digest-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Digest</text>
          </view>
          <ActionButton
            testID="crypto-digest-button"
            title="Digest SHA-256"
            [color]="lineColor"
            (press)="digestSample()"
          />
          @if (digest(); as value) {
            <ValueRow label="SHA-256" [value]="value" />
          }
        </view>

        <view testID="crypto-random-bytes-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Random bytes</text>
          </view>
          <ActionButton
            testID="crypto-random-bytes-button"
            title="Get 16 random bytes"
            [color]="lineColor"
            (press)="getRandomBytes()"
          />
          @if (randomBytes(); as value) {
            <ValueRow label="Bytes" [value]="value" />
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class CryptoScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  readonly lineColor = LINE_COLOR.crypto;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.crypto };
  readonly newUuid = randomUUID;
  readonly scenarioSteps = [
    'Press the UUID button twice',
    'Generate random bytes',
    'Hash the same text twice with SHA-256',
  ];

  readonly uuid = signal<string | null>(null);
  readonly digest = signal<string | null>(null);
  readonly randomBytes = signal<string | null>(null);

  digestSample(): void {
    void digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      DIGEST_SAMPLE_STRING,
    ).then(value => this.digest.set(value));
  }

  getRandomBytes(): void {
    void getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes =>
      this.randomBytes.set(Array.from(bytes).join(', ')),
    );
  }
}
