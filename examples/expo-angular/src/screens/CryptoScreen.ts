import { Component, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DIGEST_SAMPLE_STRING = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

/**
 * @symbiote-native/crypto canary demo: three buttons over the package's sync/async surface —
 * randomUUID(), digestStringAsync(SHA256, …), and getRandomBytesAsync(). Every function is a
 * plain free function off the core package — no service to inject(), same shape as
 * @symbiote-native/local-auth's plain-function surface. Angular twin of
 * ../../react/screens/CryptoScreen.tsx.
 */
@Component({
  selector: 'CryptoScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="crypto-scroll"
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
            <text class="hero-title">Crypto</text>
            <text class="hero-body">
              @symbiote-native/crypto — cryptographically secure random bytes,
              randomUUID, and string digest hashing (SHA-1/256/384/512,
              MD2/4/5).
            </text>
          </view>
        </view>

        <view testID="crypto-uuid-card" class="capability-card">
          <text class="capability-card-title">Random UUID</text>
          <ActionButton
            testID="crypto-generate-uuid-button"
            title="Generate UUID"
            (press)="handleGenerateUuid()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="crypto-uuid-result" class="value-text">{{
            uuidLabel()
          }}</text>
        </view>

        <view testID="crypto-digest-card" class="capability-card">
          <text class="capability-card-title">Digest</text>
          <ActionButton
            testID="crypto-digest-sha256-button"
            title="Digest SHA-256"
            (press)="handleDigestSha256()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="crypto-digest-result" class="value-text">{{
            digestLabel()
          }}</text>
        </view>

        <view testID="crypto-random-bytes-card" class="capability-card">
          <text class="capability-card-title">Random bytes</text>
          <ActionButton
            testID="crypto-random-bytes-button"
            title="Get 16 random bytes"
            (press)="handleGetRandomBytes()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="crypto-random-bytes-result" class="value-text">{{
            randomBytesLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class CryptoScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly uuid = signal<string | null>(null);
  readonly digest = signal<string | null>(null);
  readonly randomBytes = signal<Uint8Array | null>(null);

  handleGenerateUuid(): void {
    this.uuid.set(randomUUID());
  }

  handleDigestSha256(): void {
    digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_STRING).then(
      value => this.digest.set(value),
    );
  }

  handleGetRandomBytes(): void {
    getRandomBytesAsync(RANDOM_BYTE_COUNT).then(value =>
      this.randomBytes.set(value),
    );
  }

  uuidLabel(): string {
    return this.uuid() ?? 'not generated yet';
  }

  digestLabel(): string {
    return this.digest() ?? 'not digested yet';
  }

  randomBytesLabel(): string {
    const bytes = this.randomBytes();
    return bytes === null ? 'not generated yet' : Array.from(bytes).join(', ');
  }
}
