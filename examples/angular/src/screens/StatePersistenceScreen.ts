import { Component, signal } from '@angular/core';
import { SafeAreaViewElement, Text, View } from '@symbiote-native/angular';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import {
  injectNavigation,
  injectNavigationState,
} from '@symbiote-native/navigation/angular';
import type {
  INavigationHandle,
  INavigatorHandle,
} from '@symbiote-native/navigation/angular';
import type { INavigatorState } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function isResettableHandle(
  handle: INavigationHandle,
): handle is INavigationHandle & INavigatorHandle {
  return 'reset' in handle;
}

/**
 * State persistence demo: "Serialize" reads the LIVE root Stack state via injectNavigationState and
 * JSON.stringifies serializeNavigatorState's output for display; "Restore" parses that same JSON
 * back with deserializeNavigatorState (which validates the shape, no blind cast) and hands it to
 * navigation.reset() - the round trip real persistence (initialState/onStateChange) is built on.
 * Restoring genuinely navigates: the stack becomes exactly the serialized snapshot, which may
 * move you away from this very screen. Angular twin of
 * ../../react/screens/StatePersistenceScreen.tsx.
 */
@Component({
  selector: 'StatePersistenceScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <view class="section">
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">SP</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">State persistence</text>
            <text class="hero-body">
              The Stack's own state serialized out and deserialized back in —
              restoring exactly where you left off.
            </text>
          </view>
        </view>
        <text class="info-text">{{
          'current stack depth: ' + state().routes.length
        }}</text>
        <ActionButton
          testID="persist-serialize"
          title="Serialize current stack"
          (press)="onSerialize()"
          [color]="lineColorRouting"
        ></ActionButton>
        <ActionButton
          testID="persist-restore"
          title="Restore serialized snapshot"
          (press)="onRestore()"
          [color]="lineColorRouting"
        ></ActionButton>
        @if (restoreError(); as error) {
          <text class="info-text">{{ 'error: ' + error }}</text>
        }
        <view class="box-list160">
          <text testID="persist-snapshot" class="list-row-text">{{
            snapshotText()
          }}</text>
        </view>
      </view>
    </safe-area-view>
  `,
})
export class StatePersistenceScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly lineColorRouting = LINE_COLOR.routing;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.routing };

  readonly state: ReturnType<typeof injectNavigationState<INavigatorState>>;
  private readonly liveNavigation: INavigationHandle;

  readonly snapshot = signal<string | undefined>(undefined);
  readonly restoreError = signal<string | undefined>(undefined);

  constructor() {
    this.liveNavigation = injectNavigation();
    this.state = injectNavigationState<INavigatorState>(
      currentState => currentState,
    );
  }

  onSerialize(): void {
    this.restoreError.set(undefined);
    this.snapshot.set(
      JSON.stringify(serializeNavigatorState(this.state()), null, 2),
    );
  }

  onRestore(): void {
    const snapshot = this.snapshot();
    if (snapshot === undefined) return;
    if (!isResettableHandle(this.liveNavigation)) {
      this.restoreError.set(
        'this screen is not mounted under a Stack — reset() is unavailable',
      );
      return;
    }
    try {
      const parsed: unknown = JSON.parse(snapshot);
      this.liveNavigation.reset(deserializeNavigatorState(parsed));
      this.restoreError.set(undefined);
    } catch (error) {
      this.restoreError.set(
        error instanceof Error ? error.message : 'restore failed',
      );
    }
  }

  snapshotText(): string {
    return (
      this.snapshot() ??
      'tap Serialize to capture the current route stack as JSON'
    );
  }
}
