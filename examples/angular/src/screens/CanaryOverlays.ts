import { Component, input, signal } from '@angular/core';
import {
  Modal,
  PortalDirective,
  SYMBIOTE_ELEMENTS,
  TunnelInDirective,
} from '@symbiote-native/angular';
import type { PortalOutletDirective } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ACCENT, overlayTunnel } from './canary-shared';

@Component({
  selector: 'CanaryModal',
  standalone: true,
  imports: [ActionButton, Modal, SYMBIOTE_ELEMENTS],
  template: `
    <ActionButton
      testID="angular-open-modal"
      title="Open modal"
      (press)="isOpen.set(true)"
      [color]="accent"
    />
    <Modal
      testID="angular-modal"
      [visible]="isOpen()"
      animationType="fade"
      [transparent]="true"
      (requestClose)="isOpen.set(false)"
    >
      <view class="modal-overlay">
        <view testID="angular-modal-card" class="modal-card">
          <text class="modal-title">Angular Modal</text>
          <text class="modal-body"
            >Committed through the same Fabric childSet from the Angular
            adapter.</text
          >
          <ActionButton
            testID="angular-close-modal"
            title="Close"
            (press)="isOpen.set(false)"
            [color]="accent"
          />
        </view>
      </view>
    </Modal>
  `,
})
export class CanaryModal {
  readonly accent = ACCENT;
  readonly isOpen = signal(false);
}

// The portal directive moves the card into the overlay host, a sibling of the scroll view
@Component({
  selector: 'CanaryPortal',
  standalone: true,
  imports: [ActionButton, PortalDirective, SYMBIOTE_ELEMENTS],
  template: `
    <ActionButton
      testID="angular-toast-open"
      title="Show toast (createPortal)"
      (press)="isShown.set(true)"
      [color]="accent"
    />
    @if (isShown()) {
      <ng-template [portal]="host()">
        <view testID="angular-toast-card" class="modal-card">
          <text class="modal-body">Ported via createPortal ✦</text>
          <ActionButton
            testID="angular-toast-dismiss-btn"
            title="Dismiss"
            (press)="isShown.set(false)"
            [color]="accent"
          />
        </view>
      </ng-template>
    }
  `,
})
export class CanaryPortal {
  readonly host = input.required<PortalOutletDirective>();
  readonly accent = ACCENT;
  readonly isShown = signal(false);
}

// createTunnel needs no ref or target: the tunnelIn directive registers its content, Out reads it back
@Component({
  selector: 'CanaryTunnel',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, TunnelInDirective],
  template: `
    <ActionButton
      testID="angular-tunnel-toast-open"
      title="Show toast (createTunnel)"
      (press)="isShown.set(true)"
      [color]="accent"
    />
    @if (isShown()) {
      <ng-template [tunnelIn]="tunnel">
        <view testID="angular-tunnel-toast-card" class="modal-card">
          <text class="modal-body">Ported via createTunnel ✦</text>
          <ActionButton
            testID="angular-tunnel-toast-dismiss-btn"
            title="Dismiss"
            (press)="isShown.set(false)"
            [color]="accent"
          />
        </view>
      </ng-template>
    }
  `,
})
export class CanaryTunnel {
  readonly accent = ACCENT;
  readonly tunnel = overlayTunnel;
  readonly isShown = signal(false);
}
