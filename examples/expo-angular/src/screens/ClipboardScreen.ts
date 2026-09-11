import { Component, Injector, effect, inject, signal } from '@angular/core';
import {
  Platform,
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  TextInputElement,
  View,
} from '@symbiote-native/angular';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

/**
 * @symbiote-native/clipboard canary demo: the current clipboard string (seeded via
 * getStringAsync(), kept live through ClipboardService.connect()'s change signal), a copy-text
 * card, and — iOS only — the URL-specific get/set/has surface. ClipboardService.connect()'s
 * signal carries only the changed content TYPES (IClipboardEvent), never the string itself, so a
 * change is treated as a cue to refetch via getStringAsync() rather than a value to render
 * directly. Angular twin of ../../react/screens/ClipboardScreen.tsx — same seed+listener shape as
 * @symbiote-native/sensors' AccelerometerService.connect().
 */
@Component({
  selector: 'ClipboardScreen',
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
        testID="clipboard-scroll"
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
            <text class="hero-title">Clipboard</text>
            <text class="hero-body">
              @symbiote-native/clipboard — read/write the system clipboard, with
              a live change listener. On iOS 16+ a denied paste permission reads
              as empty content, not an error.
            </text>
          </view>
        </view>

        <view testID="clipboard-value-card" class="capability-card">
          <text class="capability-card-title">Clipboard content</text>
          <view testID="clipboard-value" class="capability-row">
            <text class="capability-label">Current value</text>
            <text class="value-text">{{ clipboardValue() || '(empty)' }}</text>
          </view>
          <view testID="clipboard-has-string" class="capability-row">
            <text class="capability-label">Has text</text>
            <view [class]="statusBadgeClass(hasString())">
              <text class="status-badge-text">{{
                statusLabel(hasString())
              }}</text>
            </view>
          </view>
        </view>

        <view testID="clipboard-copy-card" class="capability-card">
          <text class="capability-card-title">Copy text</text>
          <text-input
            testID="clipboard-input"
            class="text-input"
            placeholder="Type text to copy"
            [value]="inputText()"
            (valueChange)="inputText.set($event)"
          ></text-input>
          <ActionButton
            testID="clipboard-copy-button"
            title="Copy text"
            (press)="handleCopy()"
            [color]="lineColor"
          ></ActionButton>
        </view>

        @if (Platform.OS === 'ios') {
          <view testID="clipboard-url-card" class="capability-card">
            <text class="capability-card-title">URL</text>
            <text-input
              testID="clipboard-url-input"
              class="text-input"
              placeholder="https://…"
              [value]="inputUrl()"
              (valueChange)="inputUrl.set($event)"
            ></text-input>
            <view class="button-row">
              <ActionButton
                testID="clipboard-url-get-button"
                title="Get URL"
                (press)="handleGetUrl()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="clipboard-url-set-button"
                title="Set URL"
                (press)="handleSetUrl()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="clipboard-url-has-button"
                title="Has URL"
                (press)="handleHasUrl()"
                [color]="lineColor"
              ></ActionButton>
            </view>
            <view testID="clipboard-url-value" class="capability-row">
              <text class="capability-label">URL value</text>
              <text class="value-text">{{ urlValue() ?? '(none)' }}</text>
            </view>
            <view testID="clipboard-has-url" class="capability-row">
              <text class="capability-label">Has URL</text>
              <view [class]="statusBadgeClass(hasUrl())">
                <text class="status-badge-text">{{
                  statusLabel(hasUrl())
                }}</text>
              </view>
            </view>
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class ClipboardScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  private readonly injector = inject(Injector);
  private readonly clipboardEvent = inject(ClipboardService).connect();

  readonly clipboardValue = signal('');
  readonly hasString = signal<ICapabilityStatus>('checking');
  readonly inputText = signal('');

  readonly urlValue = signal<string | null>(null);
  readonly hasUrl = signal<ICapabilityStatus>('checking');
  readonly inputUrl = signal('');

  constructor() {
    this.refreshClipboardValue();
    if (Platform.OS === 'ios') {
      this.refreshUrlValues();
    }
    effect(
      () => {
        if (this.clipboardEvent() !== null) {
          this.refreshClipboardValue();
        }
      },
      { injector: this.injector },
    );
  }

  handleCopy(): void {
    setStringAsync(this.inputText()).then(() => {
      this.inputText.set('');
      this.refreshClipboardValue();
    });
  }

  handleGetUrl(): void {
    getUrlAsync().then(value => this.urlValue.set(value));
  }

  handleSetUrl(): void {
    setUrlAsync(this.inputUrl()).then(() => this.refreshUrlValues());
  }

  handleHasUrl(): void {
    hasUrlAsync().then(value => this.hasUrl.set(toCapabilityStatus(value)));
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `status-badge status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }

  private refreshClipboardValue(): void {
    getStringAsync().then(text => this.clipboardValue.set(text));
    hasStringAsync().then(has => this.hasString.set(toCapabilityStatus(has)));
  }

  private refreshUrlValues(): void {
    getUrlAsync().then(value => this.urlValue.set(value));
    hasUrlAsync().then(value => this.hasUrl.set(toCapabilityStatus(value)));
  }
}
