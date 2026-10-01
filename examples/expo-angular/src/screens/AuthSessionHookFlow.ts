import { Component, computed, input, output } from '@angular/core';
import { injectAuthRequest } from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionHookFlow',
  standalone: true,
  imports: [ActionButton, ResultRow],
  template: `
    <ResultRow
      testID="auth-session-hook-state"
      label="useAuthRequest"
      [value]="stateText()"
    />
    <ActionButton
      testID="auth-session-hook-prompt"
      title="promptAsync from useAuthRequest"
      [color]="color()"
      (press)="prompt()"
    />
  `,
})
export class AuthSessionHookFlow {
  readonly form = input.required<IForm>();
  readonly discovery = input.required<IDiscoveryDocument | null>();
  readonly color = input.required<string>();
  readonly result = output<unknown>();

  private readonly hook = injectAuthRequest(
    () => toRequestConfig(this.form()),
    () => this.discovery(),
  );

  readonly stateText = computed(() => {
    const [request, result] = this.hook;
    return `${request() === null ? 'request loading' : 'request ready'}, result ${result()?.type ?? 'none'}`;
  });

  prompt(): void {
    const [, , promptAsync] = this.hook;
    promptAsync().then(outcome => this.result.emit(outcome));
  }
}
