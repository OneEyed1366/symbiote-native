import { Component, computed, input } from '@angular/core';
import { injectFacebookAuthRequest } from '@symbiote-native/auth-session/angular';
import { AuthSessionPrompter } from './AuthSessionPrompter';
import { describe } from './auth-session-provider-form';
import type { IProviderForm } from './auth-session-provider-form';

@Component({
  selector: 'AuthSessionFacebookProbe',
  standalone: true,
  imports: [AuthSessionPrompter],
  template: `
    <AuthSessionPrompter
      label="useFacebookAuthRequest"
      [state]="state()"
      (prompt)="prompt()"
    />
  `,
})
export class AuthSessionFacebookProbe {
  readonly form = input.required<IProviderForm>();

  private readonly hook = injectFacebookAuthRequest(
    () => ({ clientId: this.form().clientId }),
    () => ({ scheme: this.form().scheme }),
  );

  readonly state = computed(() => describe(this.hook[0](), this.hook[1]()));

  prompt(): void {
    void this.hook[2]();
  }
}
