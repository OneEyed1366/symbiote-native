import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  NavigationBar,
  addVisibilityListener,
  getVisibilityAsync,
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  setHidden,
  setStyle,
  setVisibilityAsync,
} from '@symbiote-native/navigation-bar/angular';
import type {
  INavigationBarStackEntry,
  INavigationBarStyle,
} from '@symbiote-native/navigation-bar/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { NavigationBarHookValue } from './NavigationBarHookValue';

const MAX_LOGGED_EVENTS = 8;

const STYLES: readonly { label: string; value: INavigationBarStyle }[] = [
  { label: 'auto', value: 'auto' },
  { label: 'inverted', value: 'inverted' },
  { label: 'light', value: 'light' },
  { label: 'dark', value: 'dark' },
];

@Component({
  selector: 'NavigationBarScreen',
  standalone: true,
  imports: [
    CallConsole,
    Card,
    ChoiceRow,
    Explorer,
    NavigationBar,
    NavigationBarHookValue,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="navigation-bar-scroll"
      title="Navigation Bar"
      body="Android only. Style and hide the system navigation bar for full-screen content, and react when it comes back."
    >
      @if (isAndroid) {
        <Scenario
          testID="navigation-bar-style-card"
          title="Go edge-to-edge for a video, a game or a reader (Android)"
          why="Hide the system navigation bar for full-screen content and match its icon color to your screen. A swipe from the edge brings the bar back temporarily."
          [steps]="styleSteps"
          expect="The bar disappears and comes back on command, and getVisibilityAsync reports hidden or visible accordingly."
        >
          <ChoiceRow
            testID="navigation-bar-style"
            label="style"
            [options]="styles"
            [value]="style()"
            (valueChange)="chooseStyle($event)"
            [color]="color"
          />
          <CallConsole
            isBare
            prefix="navigation-bar-visibility"
            title="Visibility calls"
            [color]="color"
            [calls]="visibilityCalls"
          />
        </Scenario>

        <Scenario
          testID="navigation-bar-listener-card"
          title="React when the bar appears or hides"
          why="Adjust padding or pause a video when the user swipes the system bar in or out over your content."
          [steps]="listenerSteps"
          expect="Each change adds a line to the log below with the new visibility."
        >
          <ToggleRow
            testID="navigation-bar-listener-switch"
            label="listen"
            [value]="isListening()"
            (valueChange)="toggleListener($event)"
            [color]="color"
          />
          <text testID="navigation-bar-listener-log" class="info-text">{{
            logText()
          }}</text>
        </Scenario>

        <Explorer testID="navigation-bar-explorer" [color]="color">
          <ng-template>
            <Card
              testID="navigation-bar-component-card"
              title="NavigationBar component"
            >
              <ToggleRow
                testID="navigation-bar-first-switch"
                label="first instance: style light"
                [(value)]="isFirstOn"
                [color]="color"
              />
              <ToggleRow
                testID="navigation-bar-second-switch"
                label="second instance mounted (last one wins)"
                [(value)]="isSecondOn"
                [color]="color"
              />
              <ToggleRow
                testID="navigation-bar-second-hidden-switch"
                label="second instance: hidden"
                [(value)]="isSecondHidden"
                [color]="color"
              />
              @if (isFirstOn()) {
                <navigation-bar [style]="firstInstanceStyle" />
              }
              @if (isSecondOn()) {
                <navigation-bar [hidden]="isSecondHidden()" />
              }
              <NavigationBarHookValue />
            </Card>
            <CallConsole
              prefix="navigation-bar-stack"
              title="Entry stack (imperative twin of the component)"
              [color]="color"
              [calls]="stackCalls"
            />
            <ResultRow
              testID="navigation-bar-depth"
              label="stack depth"
              [value]="'' + depth()"
            />
          </ng-template>
        </Explorer>
      } @else {
        <Card testID="navigation-bar-unsupported-card" title="Android only">
          <text class="info-text">
            The system navigation bar exists on Android only, run this screen on
            an Android device or emulator.
          </text>
        </Card>
      }
    </ScreenShell>
  `,
})
export class NavigationBarScreen {
  readonly route = ROUTE_NAME.NavigationBar;
  readonly color = lineColorOf(ROUTE_NAME.NavigationBar);
  readonly isAndroid = Platform.select({ android: true, default: false });
  readonly firstInstanceStyle: INavigationBarStyle = 'light';
  readonly styles = STYLES;
  readonly styleSteps = [
    'Choose a style (light or dark icons)',
    'Press setHidden(true)',
    'Swipe from the bottom edge, then press setHidden(false)',
  ];
  readonly listenerSteps = [
    'Turn listening on',
    'Swipe the bar in and out from the bottom edge',
  ];

  readonly style = signal<INavigationBarStyle>('auto');
  private readonly lines = signal<string[]>([]);
  readonly isListening = signal(false);
  readonly isFirstOn = signal(false);
  readonly isSecondOn = signal(false);
  readonly isSecondHidden = signal(true);
  readonly depth = signal(0);

  private subscription: ReturnType<typeof addVisibilityListener> | null = null;
  private readonly entries: INavigationBarStackEntry[] = [];

  readonly visibilityCalls = [
    { label: 'setHidden(true)', run: async () => setHidden(true) },
    { label: 'setHidden(false)', run: async () => setHidden(false) },
    {
      label: 'setVisibilityAsync(hidden)',
      run: () => setVisibilityAsync('hidden'),
    },
    {
      label: 'setVisibilityAsync(visible)',
      run: () => setVisibilityAsync('visible'),
    },
    { label: 'getVisibilityAsync', run: () => getVisibilityAsync() },
  ];

  readonly stackCalls = [
    {
      label: 'pushStackEntry(hidden)',
      run: async () => {
        this.entries.push(pushStackEntry({ hidden: true }));
        this.depth.set(this.entries.length);
      },
    },
    {
      label: 'replaceStackEntry(last, light)',
      run: async () => {
        this.entries.push(
          replaceStackEntry(this.takeLast(), { style: 'light' }),
        );
        this.depth.set(this.entries.length);
      },
    },
    {
      label: 'popStackEntry(last)',
      run: async () => {
        popStackEntry(this.takeLast());
        this.depth.set(this.entries.length);
      },
    },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  logText(): string {
    const lines = this.lines();
    return lines.length === 0
      ? 'no events yet, swipe the bar in and out'
      : lines.join('\n');
  }

  toggleListener(next: boolean): void {
    this.isListening.set(next);
    if (next) {
      this.subscription = addVisibilityListener(event => {
        this.lines.update(lines =>
          [
            `${event.visibility} (rawVisibility ${event.rawVisibility})`,
            ...lines,
          ].slice(0, MAX_LOGGED_EVENTS),
        );
      });
    } else {
      this.subscription?.remove();
      this.subscription = null;
    }
  }

  private takeLast(): INavigationBarStackEntry {
    const last = this.entries.pop();
    if (last === undefined) {
      throw new Error('push an entry first');
    }
    return last;
  }

  chooseStyle(next: INavigationBarStyle): void {
    this.style.set(next);
    setStyle(next);
  }
}
