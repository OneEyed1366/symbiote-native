import { Component, input, output, signal } from '@angular/core';
import { AuthRequest, loadAsync } from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { CallConsole } from '../components/CallConsole';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionManualFlow',
  standalone: true,
  imports: [CallConsole, Field],
  template: `
    <Field
      testID="auth-session-return-input"
      label="return url for parseReturnUrl"
      [(value)]="returnUrl"
    />
    <CallConsole
      prefix="auth-session-manual"
      title="new AuthRequest(config)"
      [color]="color()"
      [calls]="calls"
    />
  `,
})
export class AuthSessionManualFlow {
  readonly form = input.required<IForm>();
  readonly discovery = input.required<IDiscoveryDocument | null>();
  readonly color = input.required<string>();
  readonly result = output<unknown>();

  readonly returnUrl = signal('');

  private request(): AuthRequest {
    return new AuthRequest(toRequestConfig(this.form()));
  }

  private needDiscovery(): IDiscoveryDocument {
    const document = this.discovery();
    if (document === null) {
      throw new Error('resolve discovery first');
    }
    return document;
  }

  readonly calls: ICall[] = [
    {
      label: 'getAuthRequestConfigAsync',
      run: () => this.request().getAuthRequestConfigAsync(),
    },
    {
      label: 'makeAuthUrlAsync',
      run: () => this.request().makeAuthUrlAsync(this.needDiscovery()),
    },
    {
      label: 'promptAsync',
      run: async () => {
        const outcome = await this.request().promptAsync(this.needDiscovery());
        this.result.emit(outcome);
        return outcome;
      },
    },
    {
      label: 'parseReturnUrl',
      run: async () => this.request().parseReturnUrl(this.returnUrl()),
    },
    {
      label: 'loadAsync(config, issuer)',
      run: async () => {
        const loaded = await loadAsync(
          toRequestConfig(this.form()),
          this.form().issuer,
        );
        return loaded.state;
      },
    },
  ];
}
