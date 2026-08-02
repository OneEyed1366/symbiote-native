import { Component, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import { polyfillWebCrypto, webCrypto } from '@symbiote-native/standard-web-crypto/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RANDOM_BYTE_COUNT = 16;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * @symbiote-native/standard-web-crypto canary demo: a random-bytes button over the partial
 * W3C `crypto.getRandomValues` polyfill, plus a second button installing that polyfill onto
 * `globalThis.crypto` and reporting whether it's now defined. Every export is a plain re-export
 * off the core package — no service to inject(), same shape as @symbiote-native/crypto's plain
 * free-function surface.
 */
@Component({
  selector: 'WebCryptoScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="web-crypto-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Web Crypto</Text>
            <Text class="hero-body">
              @symbiote-native/standard-web-crypto — a partial W3C Web Crypto polyfill exposing
              crypto.getRandomValues, backed by @symbiote-native/crypto's native random source.
            </Text>
          </View>
        </View>

        <View testID="web-crypto-random-bytes-card" class="capability-card">
          <Text class="capability-card-title">Random bytes</Text>
          <ActionButton
            testID="web-crypto-generate-button"
            title="Generate 16 random bytes"
            (press)="handleGenerateRandomBytes()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="web-crypto-random-bytes-result" class="value-text">{{ randomBytesLabel() }}</Text>
        </View>

        <View testID="web-crypto-polyfill-card" class="capability-card">
          <Text class="capability-card-title">Polyfill</Text>
          <ActionButton
            testID="web-crypto-install-polyfill-button"
            title="Install polyfill"
            (press)="handleInstallPolyfill()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="web-crypto-polyfill-result" class="value-text">{{ polyfillLabel() }}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class WebCryptoScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly randomBytes = signal<Uint8Array | null>(null);
  readonly isPolyfillInstalled = signal<boolean | null>(null);

  handleGenerateRandomBytes(): void {
    this.randomBytes.set(webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT)));
  }

  handleInstallPolyfill(): void {
    polyfillWebCrypto();
    this.isPolyfillInstalled.set(typeof globalThis.crypto !== 'undefined');
  }

  randomBytesLabel(): string {
    const bytes = this.randomBytes();
    return bytes === null ? 'not generated yet' : toHex(bytes);
  }

  polyfillLabel(): string {
    const isInstalled = this.isPolyfillInstalled();
    return isInstalled === null ? 'not installed yet' : `globalThis.crypto defined: ${isInstalled}`;
  }
}
