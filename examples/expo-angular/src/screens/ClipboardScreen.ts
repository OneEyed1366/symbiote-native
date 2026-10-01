import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  ClipboardService,
  getStringAsync,
  getUrlAsync,
  hasStringAsync,
  hasUrlAsync,
  setStringAsync,
  setUrlAsync,
} from '@symbiote-native/clipboard/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { CapabilityRow } from './CapabilityRow';
import { ValueRow } from './ValueRow';

const IOS_OS = 'ios';

@Component({
  selector: 'ClipboardScreen',
  standalone: true,
  imports: [ActionButton, CapabilityRow, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="clipboard-scroll"
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
            <text class="hero-title">Clipboard</text>
            <text class="hero-body">
              Copy and paste from the app: write text or a link to the system
              clipboard, read it back and follow changes live. Copy something in
              another app to see the value below update on its own.
            </text>
          </view>
        </view>

        <Scenario
          testID="clipboard-scenario"
          title="Copy a promo code or an invite link with one tap"
          why="Copy buttons save users from selecting text by hand. Reading the clipboard lets the app offer to paste a code or a link the user just copied elsewhere."
          [steps]="scenarioSteps"
          expect="The pasted text matches what you copied. The value card updates by itself when the clipboard changes outside the app."
        />

        <view testID="clipboard-value-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Current value</text>
          </view>
          <ValueRow
            label="Clipboard text"
            [value]="
              clipboardText() === null
                ? 'checking…'
                : clipboardText() || '(empty)'
            "
          />
          <CapabilityRow
            testID="clipboard-has-string"
            label="Has string"
            [status]="hasString()"
          />
        </view>

        <view testID="clipboard-copy-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Copy text</text>
          </view>
          <text-input
            testID="clipboard-copy-input"
            [value]="inputText()"
            placeholder="Type something to copy"
            placeholderTextColor="#41506a"
            class="text-input"
            (valueChange)="inputText.set($event)"
          />
          <ActionButton
            testID="clipboard-copy-button"
            title="Copy text"
            [color]="lineColor"
            (press)="copy()"
          />
        </view>

        @if (isIos) {
          <view testID="clipboard-url-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">URL (iOS only)</text>
            </view>
            <ValueRow
              label="Clipboard URL"
              [value]="
                clipboardUrl() === null
                  ? 'checking…'
                  : clipboardUrl() || '(none)'
              "
            />
            <CapabilityRow
              testID="clipboard-has-url"
              label="Has URL"
              [status]="hasUrl()"
            />
            <text-input
              testID="clipboard-url-input"
              [value]="urlText()"
              placeholder="https://example.com"
              placeholderTextColor="#41506a"
              class="text-input"
              (valueChange)="urlText.set($event)"
            />
            <ActionButton
              testID="clipboard-set-url-button"
              title="Set URL"
              [color]="lineColor"
              (press)="setUrl()"
            />
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class ClipboardScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  readonly lineColor = LINE_COLOR.clipboard;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.clipboard };
  readonly isIos = Platform.OS === IOS_OS;
  readonly scenarioSteps = [
    'Write some text and press copy',
    'Open another app and paste',
    'Copy something in another app and come back',
  ];

  private readonly clipboardChange = inject(ClipboardService).connect();
  readonly clipboardText = signal<string | null>(null);
  readonly hasString = signal<ICapabilityStatus>('checking');
  readonly clipboardUrl = signal<string | null>(null);
  readonly hasUrl = signal<ICapabilityStatus>('checking');
  readonly inputText = signal('');
  readonly urlText = signal('');

  private isAlive = true;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.isAlive = false;
    });
    effect(() => {
      this.clipboardChange();
      this.refreshText();
      this.refreshUrl();
    });
  }

  private refreshText(): void {
    void Promise.all([getStringAsync(), hasStringAsync()]).then(
      ([text, hasText]) => {
        if (this.isAlive) {
          this.clipboardText.set(text);
          this.hasString.set(toCapabilityStatus(hasText));
        }
      },
    );
  }

  private refreshUrl(): void {
    if (!this.isIos) {
      return;
    }
    void Promise.all([getUrlAsync(), hasUrlAsync()]).then(
      ([url, hasUrlValue]) => {
        if (this.isAlive) {
          this.clipboardUrl.set(url);
          this.hasUrl.set(toCapabilityStatus(hasUrlValue));
        }
      },
    );
  }

  copy(): void {
    void setStringAsync(this.inputText());
  }

  setUrl(): void {
    void setUrlAsync(this.urlText()).then(() =>
      getUrlAsync().then(value => this.clipboardUrl.set(value)),
    );
  }
}
