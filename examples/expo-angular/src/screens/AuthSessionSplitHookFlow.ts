import { Component, computed, input } from '@angular/core';
import {
  AuthRequest,
  injectAuthRequestResult,
  injectLoadedAuthRequest,
} from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionSplitHookFlow',
  standalone: true,
  imports: [ActionButton, ResultRow],
  template: `
    <ResultRow
      testID="auth-session-split-state"
      label="useLoadedAuthRequest + useAuthRequestResult"
      [value]="stateText()"
    />
    <ActionButton
      testID="auth-session-split-prompt"
      title="promptAsync from useAuthRequestResult"
      [color]="color()"
      (press)="prompt()"
    />
  `,
})
export class AuthSessionSplitHookFlow {
  readonly form = input.required<IForm>();
  readonly discovery = input.required<IDiscoveryDocument | null>();
  readonly color = input.required<string>();

  private readonly request = injectLoadedAuthRequest(
    () => toRequestConfig(this.form()),
    () => this.discovery(),
    AuthRequest,
  );
  private readonly hook = injectAuthRequestResult(this.request, () =>
    this.discovery(),
  );

  readonly stateText = computed(() => {
    const [result] = this.hook;
    return `${this.request() === null ? 'request loading' : 'request ready'}, result ${result()?.type ?? 'none'}`;
  });

  prompt(): void {
    const [, promptAsync] = this.hook;
    void promptAsync();
  }
}
