import { Component, computed, input } from '@angular/core';
import { injectGoogleAuthRequest } from '@symbiote-native/auth-session/angular';
import { AuthSessionPrompter } from './AuthSessionPrompter';
import { describe, googleConfig } from './auth-session-provider-form';
import type { IProviderForm } from './auth-session-provider-form';

@Component({
  selector: 'AuthSessionGoogleProbe',
  standalone: true,
  imports: [AuthSessionPrompter],
  template: `
    <AuthSessionPrompter
      label="useGoogleAuthRequest"
      [state]="state()"
      (prompt)="prompt()"
    />
  `,
})
export class AuthSessionGoogleProbe {
  readonly form = input.required<IProviderForm>();

  private readonly hook = injectGoogleAuthRequest(
    () => googleConfig(this.form()),
    () => ({ scheme: this.form().scheme }),
  );

  readonly state = computed(() => describe(this.hook[0](), this.hook[1]()));

  prompt(): void {
    void this.hook[2]();
  }
}
