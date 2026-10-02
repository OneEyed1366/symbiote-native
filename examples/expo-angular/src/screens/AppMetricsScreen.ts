import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  AppMetricsRoot,
  reportError,
} from '@symbiote-native/app-metrics/angular';
import { Explorer } from '../components/Explorer';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AppMetricsBoundaryFallback } from './AppMetricsBoundaryFallback';
import { AppMetricsMarkLog } from './AppMetricsMarkLog';
import { AppMetricsNetwork } from './AppMetricsNetwork';
import { AppMetricsReport } from './AppMetricsReport';
import { AppMetricsSessions } from './AppMetricsSessions';

const ROUTE = ROUTE_NAME.AppMetrics;

function throwOnPurpose(): never {
  throw new Error('Thrown on purpose by the canary');
}

@Component({
  selector: 'AppMetricsScreen',
  standalone: true,
  imports: [
    AppMetricsBoundaryFallback,
    AppMetricsMarkLog,
    AppMetricsNetwork,
    AppMetricsReport,
    AppMetricsRoot,
    AppMetricsSessions,
    Explorer,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="app-metrics-scroll"
      title="App Metrics"
      body="Know how your app behaves in the field: startup timing, sessions, custom log events, handled and unhandled errors and network requests, sent to your metrics backend."
    >
      <Scenario
        testID="app-metrics-boundary-card"
        title="Catch a crash, report it and show a fallback instead of a white screen"
        why="A render error in one component should not kill the app. The boundary reports it to your metrics pipeline with the component stack and lets the user recover."
        [steps]="steps"
        expect="The error is caught, its message is shown and reported. Pressing resetError renders the tree normally again."
      >
        <ToggleRow
          testID="app-metrics-throw-switch"
          label="render a component that throws"
          [value]="isThrowing()"
          (valueChange)="setThrowing($event)"
          [color]="color"
        />
        <app-metrics-root>
          <text class="info-text"
            >Inside AppMetricsRoot, markFirstRender ran on mount.</text
          >
        </app-metrics-root>
        @if (caught(); as error) {
          <AppMetricsBoundaryFallback
            [error]="error.value"
            [color]="color"
            (resetError)="reset()"
          />
        }
      </Scenario>
      <Explorer testID="app-metrics-explorer" [color]="color">
        <ng-template>
          <AppMetricsMarkLog />
          <AppMetricsReport />
          <AppMetricsSessions />
          <AppMetricsNetwork />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class AppMetricsScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly steps = [
    'Turn on the throwing component',
    'Read the caught message',
    'Press resetError',
  ];

  readonly isThrowing = signal(false);
  // Angular has no subtree error boundary on this version, so the throw is caught by hand
  readonly caught = signal<{ value: unknown } | null>(null);

  setThrowing(next: boolean): void {
    this.isThrowing.set(next);
    if (!next) {
      this.caught.set(null);
      return;
    }
    try {
      throwOnPurpose();
    } catch (error) {
      this.caught.set({ value: error });
      reportError({
        source: 'errorBoundary',
        type: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        stacktrace: error instanceof Error ? error.stack : undefined,
        isFatal: false,
      });
    }
  }

  reset(): void {
    this.isThrowing.set(false);
    this.caught.set(null);
  }
}
