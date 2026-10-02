import { Component, computed, input } from '@angular/core';
import { injectGoogleIdTokenAuthRequest } from '@symbiote-native/auth-session/angular';
import { AuthSessionPrompter } from './AuthSessionPrompter';
import { describe, googleConfig } from './auth-session-provider-form';
import type { IProviderForm } from './auth-session-provider-form';

@Component({
  selector: 'AuthSessionGoogleIdTokenProbe',
  standalone: true,
  imports: [AuthSessionPrompter],
  template: `
    <AuthSessionPrompter
      label="useGoogleIdTokenAuthRequest"
      [state]="state()"
      (prompt)="prompt()"
    />
  `,
})
export class AuthSessionGoogleIdTokenProbe {
  readonly form = input.required<IProviderForm>();

  private readonly hook = injectGoogleIdTokenAuthRequest(
    () => googleConfig(this.form()),
    () => ({ scheme: this.form().scheme }),
  );

  readonly state = computed(() => describe(this.hook[0](), this.hook[1]()));

  prompt(): void {
    void this.hook[2]();
  }
}
