import { Component, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  TextInputElement,
  View,
} from '@symbiote-native/angular';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

/**
 * @symbiote-native/sharing canary demo: a capability card (isAvailableAsync) and a share card
 * driving shareAsync against a file URI the user types in. The share sheet needs a readable local
 * file and this app ships no file-system package to produce one, so the path is an input rather
 * than a constant — a wrong path surfaces as the native error message in the result row.
 */
@Component({
  selector: 'SharingScreen',
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
        testID="sharing-scroll"
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
            <text class="hero-title">Sharing</text>
            <text class="hero-body">
              @symbiote-native/sharing — opens the platform share sheet for a
              local file. Outgoing only: it hands a file to another app, it does
              not receive one.
            </text>
          </view>
        </view>

        <view testID="sharing-capability-card" class="sharing-card">
          <text class="sharing-card-title">Capabilities</text>
          <view testID="sharing-available" class="sharing-row">
            <text class="sharing-row-label">Available</text>
            <view [class]="statusBadgeClass(isAvailable())">
              <text class="sharing-status-text">{{
                statusLabel(isAvailable())
              }}</text>
            </view>
          </view>
          <text class="sharing-note">
            Reports on the native module, not on any device capability — it is
            true on both platforms whenever the module is linked.
          </text>
        </view>

        <view testID="sharing-share-card" class="sharing-card">
          <text class="sharing-card-title">Share a file</text>
          <text class="sharing-note">
            A real local file URI is required — file:///… pointing at a file
            this app can read. There is no file-system package here to create
            one, so paste a path that already exists on the device.
          </text>
          <text-input
            testID="sharing-uri-input"
            class="text-input"
            placeholder="file:///path/to/file.png"
            placeholderTextColor="#41506a"
            [value]="fileUri()"
            (valueChange)="fileUri.set($event)"
          ></text-input>
          <ActionButton
            testID="sharing-share-button"
            title="Share"
            (press)="handleShare()"
            [color]="lineColor"
          ></ActionButton>
        </view>

        <view testID="sharing-result-card" class="sharing-card">
          <text class="sharing-card-title">Last result</text>
          <view class="sharing-row">
            <text class="sharing-row-label">Status</text>
            <text testID="sharing-result" class="sharing-value-text">{{
              lastResult()
            }}</text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class SharingScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly fileUri = signal('');
  readonly lastResult = signal('idle');

  constructor() {
    isAvailableAsync().then(available =>
      this.isAvailable.set(toCapabilityStatus(available)),
    );
  }

  handleShare(): void {
    const uri = this.fileUri().trim();
    if (uri === '') {
      this.lastResult.set('enter a file URI first');
      return;
    }
    this.lastResult.set('sheet open…');
    // Resolves when the sheet is dismissed, whichever app the user picked — the platform reports
    // no choice back, so a successful share and a cancelled one are indistinguishable here.
    shareAsync(uri, { dialogTitle: 'Share from the Symbiote canary' })
      .then(() => this.lastResult.set('sheet dismissed'))
      .catch((error: Error) => this.lastResult.set(`failed: ${error.message}`));
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `sharing-status-badge sharing-status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }
}
