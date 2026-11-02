/**
 * Canary root: the native stack over every demo screen, twin of `../react/App.tsx`
 *
 * @format
 */

import { NgComponentOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  Injector,
  OnInit,
  ViewChild,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Stack,
  ScreenDirective,
  injectLinkingIntegration,
} from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
import { MenuScreen } from './screens/MenuScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import {
  HeaderOptionsScreen,
  headerOptionsScreenOptions,
} from './screens/HeaderOptionsScreen';
import {
  SheetDemoScreen,
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { ReactiveStyleScreen } from './screens/ReactiveStyleScreen';
import { ApiPlaygroundScreen } from './screens/ApiPlaygroundScreen';
import { BenchmarkScreen } from './screens/BenchmarkScreen';
import { StyleShowcaseScreen } from './screens/StyleShowcaseScreen';
import { ReanimatedScreen } from './screens/ReanimatedScreen';
import { DEMO_SCREENS, OPTION_TEMPLATE_HOSTS } from './screens/demo-screens';
import { HUB_SCREENS } from './screens/SectionHubScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { LINE_COLOR } from './navigation-lines';
import './App.css';
import './navigation.css';

const HEADER_BACKGROUND = '#0b1622';
const DETAILS_TRANSITION_DURATION_MS = 300;

// Most headers differ only in title and tint, so they share this builder
function darkHeader(title: string, tint: string): IAngularScreenOptions {
  return {
    title,
    headerShown: true,
    headerTranslucent: true,
    headerTintColor: tint,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
  };
}

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [Stack, ScreenDirective, NgComponentOutlet],
  template: `
    @for (host of templateHosts; track host) {
      <ng-container [ngComponentOutlet]="host"></ng-container>
    }
    <Stack #nav initialRouteName="Menu">
      <ng-template
        symbioteScreen
        name="Menu"
        [component]="menuScreen"
        [options]="menuOptions"
      ></ng-template>
      @for (hub of hubs; track hub.name) {
        <ng-template
          symbioteScreen
          [name]="hub.name"
          [component]="hub.component"
          [options]="hub.options"
        ></ng-template>
      }
      <ng-template
        symbioteScreen
        name="Canary"
        [component]="canaryScreen"
        [options]="canaryOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Details"
        [component]="detailsScreen"
        [options]="detailsOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="HeaderOptions"
        [component]="headerOptionsScreen"
        [options]="headerOptionsOptions"
      ></ng-template>
      @for (demo of demos; track demo.name) {
        <ng-template
          symbioteScreen
          [name]="demo.name"
          [component]="demo.component"
          [options]="demo.options"
        ></ng-template>
      }
      <ng-template
        symbioteScreen
        name="SheetDemo"
        [component]="sheetDemoScreen"
        [options]="sheetDemoOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="HooksDemo"
        [component]="hooksDemoScreen"
        [options]="hooksDemoOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="ReactiveStyle"
        [component]="reactiveStyleScreen"
        [options]="reactiveStyleOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="ApiPlayground"
        [component]="apiPlaygroundScreen"
        [options]="apiPlaygroundOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Reanimated"
        [component]="reanimatedScreen"
        [options]="reanimatedOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Benchmark"
        [component]="benchmarkScreen"
        [options]="benchmarkOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="StyleShowcase"
        [component]="styleShowcaseScreen"
        [options]="styleShowcaseOptions"
      ></ng-template>
    </Stack>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('nav') private readonly nav!: Stack;
  private readonly injector = inject(Injector);

  readonly hubs = HUB_SCREENS;
  readonly demos = DEMO_SCREENS;
  readonly templateHosts = OPTION_TEMPLATE_HOSTS;

  readonly menuScreen = MenuScreen;
  readonly canaryScreen = CanaryScreen;
  readonly detailsScreen = DetailsScreen;
  readonly headerOptionsScreen = HeaderOptionsScreen;
  readonly sheetDemoScreen = SheetDemoScreen;
  readonly hooksDemoScreen = HooksDemoScreen;
  readonly reactiveStyleScreen = ReactiveStyleScreen;
  readonly apiPlaygroundScreen = ApiPlaygroundScreen;
  readonly reanimatedScreen = ReanimatedScreen;
  readonly benchmarkScreen = BenchmarkScreen;
  readonly styleShowcaseScreen = StyleShowcaseScreen;

  readonly menuOptions: IAngularScreenOptions = {
    title: 'Navigation Demos',
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
  };

  readonly canaryOptions = darkHeader('Symbiote Canary', LINE_COLOR.primitives);

  // Pinned, `default` resolves to a native transition of about 480ms
  readonly detailsOptions: IAngularScreenOptions = {
    title: 'Navigation Demo',
    headerTranslucent: true,
    headerTintColor: LINE_COLOR.primitives,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
    stackAnimation: 'slide_from_right',
    transitionDuration: DETAILS_TRANSITION_DURATION_MS,
  };

  readonly headerOptionsOptions = headerOptionsScreenOptions;
  readonly sheetDemoOptions = sheetDemoScreenOptions;
  readonly hooksDemoOptions = darkHeader(
    'Hooks Demo',
    LINE_COLOR.introspection,
  );
  readonly reactiveStyleOptions = darkHeader(
    'Reactive Style',
    LINE_COLOR.primitives,
  );
  readonly apiPlaygroundOptions = darkHeader(
    'API Playground',
    LINE_COLOR.introspection,
  );
  readonly reanimatedOptions = darkHeader('Reanimated', LINE_COLOR.performance);
  readonly benchmarkOptions = darkHeader('Benchmark', LINE_COLOR.performance);
  readonly styleShowcaseOptions = darkHeader(
    'Styling showcase',
    LINE_COLOR.styling,
  );

  ngOnInit(): void {
    hide();
  }

  // `injectLinkingIntegration` needs an injection context, a lifecycle hook body is not one
  // `nav` is the Stack itself and is set once the view exists, so this is the earliest safe call
  ngAfterViewInit(): void {
    runInInjectionContext(this.injector, () => {
      injectLinkingIntegration(APP_LINKING_CONFIG, this.nav);
    });
  }
}
