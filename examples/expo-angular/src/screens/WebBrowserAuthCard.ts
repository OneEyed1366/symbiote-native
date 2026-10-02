import { Component, computed, input, signal } from '@angular/core';
import {
  WebBrowserResultType,
  dismissAuthSession,
  maybeCompleteAuthSession,
  openAuthSessionAsync,
} from '@symbiote-native/web-browser';
import { CallConsole } from '../components/CallConsole';
import { Field } from '../components/Field';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toOpenOptions } from './web-browser-options';
import type { IOptionsForm } from './web-browser-options';

@Component({
  selector: 'WebBrowserAuthCard',
  standalone: true,
  imports: [CallConsole, Field, Scenario, ToggleRow],
  template: `
    <Scenario
      testID="web-browser-auth-card"
      title="Run a browser sign-in that comes back to the app"
      why="Sign-in and payment pages live on the web. An auth session opens them and resolves with the redirect URL when the page sends the user to your app scheme."
      [steps]="steps"
      expect="After the redirect the result is success with the returned URL. Cancelling gives cancel or dismiss, and dismissAuthSession closes the session from code."
    >
      <Field
        testID="web-browser-redirect-input"
        label="redirectUrl (the page must redirect here)"
        [(value)]="redirectUrl"
      />
      <ToggleRow
        testID="web-browser-skip-switch"
        label="skipRedirectCheck (for maybeCompleteAuthSession)"
        [(value)]="skipRedirectCheck"
        [color]="color"
      />
      <CallConsole
        isBare
        prefix="web-browser-auth-calls"
        title="Auth session calls"
        [color]="color"
        [hint]="hint"
        [calls]="calls()"
      />
    </Scenario>
  `,
})
export class WebBrowserAuthCard {
  readonly url = input.required<string>();
  readonly options = input.required<IOptionsForm>();

  readonly color = lineColorOf(ROUTE_NAME.WebBrowser);
  readonly steps = [
    'Point the url at a page that redirects to canaryexpo://redirect',
    'Press openAuthSessionAsync',
    'Finish or cancel the page',
  ];
  readonly hint = `Results are WebBrowserResultType values: ${Object.values(WebBrowserResultType).join(', ')}, or success with the redirect url.`;

  readonly redirectUrl = signal('canaryexpo://redirect');
  readonly skipRedirectCheck = signal(false);

  readonly calls = computed(() => [
    {
      label: 'openAuthSessionAsync',
      run: () =>
        openAuthSessionAsync(
          this.url(),
          this.redirectUrl(),
          toOpenOptions(this.options()),
        ),
    },
    { label: 'dismissAuthSession', run: async () => dismissAuthSession() },
    {
      label: 'maybeCompleteAuthSession',
      run: async () =>
        maybeCompleteAuthSession({
          skipRedirectCheck: this.skipRedirectCheck(),
        }),
    },
  ]);
}
