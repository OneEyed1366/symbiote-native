import { Component, computed, input, output } from '@angular/core';
import { injectAutoDiscovery } from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { ActionButton } from '../components/ActionButton';

@Component({
  selector: 'AuthSessionAutoDiscoveryProbe',
  standalone: true,
  imports: [ActionButton],
  template: `
    <ActionButton
      testID="auth-session-autodiscovery-use"
      [title]="title()"
      [color]="color()"
      (press)="useResult()"
    />
  `,
})
export class AuthSessionAutoDiscoveryProbe {
  readonly issuer = input.required<string>();
  readonly color = input.required<string>();
  readonly value = output<IDiscoveryDocument | null>();

  private readonly document = injectAutoDiscovery(() => this.issuer());

  readonly title = computed(() =>
    this.document() === null ? 'discovery loading…' : 'use the hook result',
  );

  useResult(): void {
    this.value.emit(this.document());
  }
}
