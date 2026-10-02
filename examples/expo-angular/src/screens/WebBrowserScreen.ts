import { Component, signal } from '@angular/core';
import { Platform } from '@symbiote-native/angular';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  mayInitWithUrlAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { WebBrowserAuthCard } from './WebBrowserAuthCard';
import { WebBrowserOptionsCard } from './WebBrowserOptionsCard';
import { INITIAL_OPTIONS, toOpenOptions } from './web-browser-options';
import type { IOptionsForm } from './web-browser-options';

const DEMO_URL = 'https://symbiote-native.dev';

@Component({
  selector: 'WebBrowserScreen',
  standalone: true,
  imports: [
    ActionButton,
    CallConsole,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    WebBrowserAuthCard,
    WebBrowserOptionsCard,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="web-browser-scroll"
      title="Web Browser"
      body="Show web content in an in-app browser that keeps the user inside your app, and run browser-based sign-in flows that return to the app with a result."
    >
      <Scenario
        testID="web-browser-open-card"
        title="Open a link or a help page without leaving the app"
        why="Terms of service, help articles and links open in Safari View Controller or a Chrome Custom Tab on top of your app, with shared cookies and one tap to get back."
        [steps]="openSteps"
        expect="The page opens in the in-app browser. Last result says cancel when closed by the user and dismiss when closed by the app on iOS, and opened on Android as soon as the tab launches."
      >
        <Field
          testID="web-browser-url-input"
          label="url"
          [(value)]="url"
          placeholder="https://example.com"
        />
        <ActionButton
          testID="web-browser-open-button"
          title="Open"
          [color]="color"
          (press)="open()"
        />
        <ActionButton
          testID="web-browser-dismiss-button"
          title="Dismiss"
          [color]="color"
          (press)="dismiss()"
        />
        <ResultRow
          testID="web-browser-result"
          label="Last result"
          [value]="lastResult()"
        />
      </Scenario>

      <WebBrowserAuthCard [url]="url()" [options]="options()" />

      <Explorer testID="web-browser-explorer" [color]="color">
        <ng-template>
          <WebBrowserOptionsCard [(form)]="options" />
          @if (isAndroid) {
            <CallConsole
              prefix="web-browser-custom-tabs"
              title="Custom Tabs service (Android)"
              [color]="color"
              hint="Android only, the calls reject on iOS."
              [calls]="customTabsCalls"
            />
          }
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class WebBrowserScreen {
  readonly route = ROUTE_NAME.WebBrowser;
  readonly color = lineColorOf(ROUTE_NAME.WebBrowser);
  readonly isAndroid = Platform.select({ android: true, default: false });
  readonly openSteps = [
    'Press Open (the sample URL is preset)',
    'Close the browser with Done or the back button',
    'Press Open again and use Dismiss from the app (iOS)',
  ];

  readonly url = signal(DEMO_URL);
  readonly options = signal<IOptionsForm>(INITIAL_OPTIONS);
  readonly lastResult = signal('idle');
  private readonly servicePackage = signal<string | undefined>(undefined);

  readonly customTabsCalls = [
    {
      label: 'getCustomTabsSupportingBrowsersAsync',
      run: () => getCustomTabsSupportingBrowsersAsync(),
    },
    {
      label: 'warmUpAsync',
      run: async () => {
        const result = await warmUpAsync();
        this.servicePackage.set(result.servicePackage);
        return result;
      },
    },
    {
      label: 'mayInitWithUrlAsync',
      run: () => mayInitWithUrlAsync(this.url(), this.servicePackage()),
    },
    { label: 'coolDownAsync', run: () => coolDownAsync(this.servicePackage()) },
  ];

  open(): void {
    this.lastResult.set('opening…');
    openBrowserAsync(this.url(), toOpenOptions(this.options()))
      .then(result => this.lastResult.set(`result: ${result.type}`))
      .catch((error: Error) =>
        this.lastResult.set(`open failed: ${error.message}`),
      );
  }

  dismiss(): void {
    dismissBrowser()
      .then(result => this.lastResult.set(`dismissed: ${result.type}`))
      .catch((error: Error) =>
        this.lastResult.set(`dismiss failed: ${error.message}`),
      );
  }
}
