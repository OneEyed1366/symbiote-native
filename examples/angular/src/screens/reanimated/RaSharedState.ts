import { Component, ViewChild, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { makeMutable } from '@symbiote-native/reanimated/angular';
import { createSynchronizable } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { RaBadge } from './RaBadge';

// Made at module load, outside any component, so nothing in Angular owns its lifetime
const clicks = makeMutable(0);
const reads = createSynchronizable(0);

// A mutable and a synchronizable made outside Angular, an animated component of ours, and a view
// prop read back from the UI side
// `createAnimatedComponent(RaBadge)` is `RaBadge` itself, and `imports` cannot take a call
@Component({
  selector: 'RaSharedState',
  standalone: true,
  imports: [ActionButton, RaBadge, SYMBIOTE_ELEMENTS],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Shared state</text>
      <text class="ra-note"
        >makeMutable, createSynchronizable, createAnimatedComponent and
        getViewProp</text
      >
      <text class="ra-note">{{ mutableNote() }}</text>
      <text class="ra-note">{{ synchronizableNote() }}</text>
      <text class="ra-note">{{ opacityNote() }}</text>
      <view class="ra-stage">
        <RaBadge />
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-shared-mutable"
          title="makeMutable +1"
          [color]="accent"
          (press)="countMutable()"
        />
        <ActionButton
          testID="ra-shared-sync"
          title="synchronizable +1"
          [color]="accent"
          (press)="countSynchronizable()"
        />
        <ActionButton
          testID="ra-shared-grow"
          title="grow badge"
          [color]="accent"
          (press)="badge?.toggle()"
        />
        <ActionButton
          testID="ra-shared-read"
          title="getViewProp"
          [color]="accent"
          (press)="readOpacity()"
        />
      </view>
    </view>
  `,
})
export class RaSharedState {
  readonly mutable = signal(clicks.value);
  readonly synchronizable = signal(reads.getBlocking());
  readonly opacity = signal('unread');
  readonly mutableNote = computed(() => `mutable: ${this.mutable()}`);
  readonly synchronizableNote = computed(
    () => `synchronizable: ${this.synchronizable()}`,
  );
  readonly opacityNote = computed(() => `opacity: ${this.opacity()}`);
  readonly accent = ACCENT;

  @ViewChild(RaBadge) protected badge?: RaBadge;

  countMutable(): void {
    clicks.value += 1;
    this.mutable.set(clicks.value);
  }

  countSynchronizable(): void {
    reads.setBlocking(previous => previous + 1);
    this.synchronizable.set(reads.getBlocking());
  }

  async readOpacity(): Promise<void> {
    this.opacity.set((await this.badge?.readOpacity()) ?? 'unread');
  }
}
