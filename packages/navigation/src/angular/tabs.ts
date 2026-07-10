// Tab, the Angular lifecycle half. The focused-index router (tab-router-state) and the tab-bar
// Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim with
// the React/Vue adapters; here Angular supplies the lifecycle — a signal for the focused index, a
// per-instance counter for route-key generation, `handle` as a plain object of methods (no ref
// forwarding needed — see stack.ts's header) — plus the descriptor bridge
// (`symbiote-descriptor-outlet`, `@symbiote-native/angular`) for the tab-bar leaf, exactly like
// Stack bridges its header config. Unlike Stack, a bottom-tabs bar is a PURE-JS UI: it paints
// ordinary `symbiote-view`/`symbiote-text` primitives via the shared render fn, so there is no
// react-native-screens ViewConfig to register — Tab needs no `../register` import. Every tag this
// template names (`View`, `symbiote-descriptor-outlet`) is a REAL imported Angular component (no
// raw non-dashed native tag names the way stack.ts needs `NO_ERRORS_SCHEMA` for), so no loosened
// schema is needed here at all.
//
// RESOLVED (see stack.ts's header, identical reasoning): `'Tab'` has an `ANCHOR_HOST_COMPONENTS`
// entry in `adapters/angular/src/renderer.ts`, so a real device build paints `<Tab>` correctly as
// a nested tag.

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  QueryList,
  signal,
  type AfterContentInit,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { dlog } from '@symbiote-native/engine';
import { DescriptorOutlet, View } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialTabState,
  createNavigationEmitter,
  isFocusedRoute,
  renderTabBar,
  tabRouterReducer,
} from '../core';
import type {
  INavigationEmitter,
  IRoute,
  ITabBarItemView,
  ITabOptions,
  ITabRouterAction,
  ITabRouterState,
} from '../core';
import { NavigationScopeDirective } from './navigation-scope.directive';
import { TabScreenDirective } from './tab-screen.directive';
import type { ITabScreenComponentProps, ITabScreenOptionsResolver } from './tab-screen.directive';

export type ITabNavigatorHandle = {
  jumpTo: (name: string, params?: unknown) => void;
  setParams: (key: string, params: unknown) => void;
};

const TAB_ROOT_STYLE = { flex: 1 };
const TAB_CONTENT_STYLE = { flex: 1 };

let tabInstanceCounter = 0;

@Component({
  selector: 'Tab',
  standalone: true,
  imports: [NgComponentOutlet, NavigationScopeDirective, DescriptorOutlet, View],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <View [style]="rootStyle">
      <View [style]="contentStyle">
        @if (focusedRoute(); as route) {
          @if (componentForRoute(route); as component) {
            <ng-container
              [symbioteNavigationScope]="route"
              [navigation]="handle"
              [emitter]="focusedRouteEmitter()"
            >
              <ng-container
                *ngComponentOutlet="component; inputs: { route: route, navigation: handle }"
              />
            </ng-container>
          }
        }
      </View>
      <symbiote-descriptor-outlet [node]="tabBarDescriptor()" />
    </View>
  `,
})
export class Tab implements AfterContentInit, OnDestroy {
  @ContentChildren(TabScreenDirective)
  private readonly tabScreenChildren!: QueryList<TabScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: ITabOptions;

  readonly rootStyle = TAB_ROOT_STYLE;
  readonly contentStyle = TAB_CONTENT_STYLE;

  private readonly routeIdPrefix = `tab-${(tabInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE TabScreenDirective instance — see stack.ts's matching comment for
  // why a snapshot copy would go stale on an in-place `[options]`/`[component]` change.
  private readonly registry = new Map<string, TabScreenDirective>();
  private tabScreenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<ITabRouterState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();

  private currentEmitterKey: string | undefined;
  private currentEmitter: INavigationEmitter | undefined;

  readonly handle: ITabNavigatorHandle = {
    jumpTo: (name, params) => this.dispatch({ type: 'jumpTo', name, params }),
    setParams: (key, params) => this.dispatch({ type: 'setParams', key, params }),
  };

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.tabScreenChildrenSubscription = this.tabScreenChildren.changes.subscribe(() => {
      this.rebuildRegistry();
    });
  }

  ngOnDestroy(): void {
    this.tabScreenChildrenSubscription?.unsubscribe();
    if (this.currentEmitter) this.currentEmitter.emit(NAVIGATION_EVENT_BLUR);
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.tabScreenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  private routesFromRegistry(): IRoute<unknown>[] {
    return Array.from(this.registry.entries()).map(([name, entry]) => ({
      key: `${this.routeIdPrefix}-${name}`,
      name,
      params: entry.initialParams,
    }));
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    const routes = this.routesFromRegistry();
    if (routes.length === 0) dlog('Tab: no <ng-template symbioteTabScreen> children registered');
    this.stateSignal.set(createInitialTabState(routes, this.initialRouteName));
  }

  private dispatch(action: ITabRouterAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    this.stateSignal.set(tabRouterReducer(current, action));
  }

  private resolveTabOptions(entry: TabScreenDirective, route: IRoute<unknown>): ITabOptions {
    const props: ITabScreenComponentProps = { route, navigation: this.handle };
    const own =
      typeof entry.options === 'function'
        ? (entry.options as ITabScreenOptionsResolver)(props)
        : entry.options;
    return { ...this.screenOptions, ...own };
  }

  focusedRoute(): IRoute<unknown> | undefined {
    const state = this.stateSignal();
    return state?.routes[state.index];
  }

  componentForRoute(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  // Lazily creates/replaces the focused route's emitter and synthesizes focus/blur — Tab paints
  // its own bar in pure JS (no native onAppear/onDisappear the way Stack's RNSScreen has), so
  // focus/blur is synthesized here exactly like react/tabs.ts's own useEffect does, just idempotent
  // per read (called repeatedly with the same key during one CD pass) instead of dependency-array
  // gated. Keyed on the route KEY, not the object, so a setParams-only change doesn't re-fire.
  focusedRouteEmitter(): INavigationEmitter {
    const key = this.focusedRoute()?.key;
    if (key === this.currentEmitterKey && this.currentEmitter) return this.currentEmitter;
    if (this.currentEmitter) {
      dlog('Tab: previous route blurred');
      this.currentEmitter.emit(NAVIGATION_EVENT_BLUR);
    }
    this.currentEmitter = createNavigationEmitter();
    this.currentEmitterKey = key;
    if (key !== undefined) {
      dlog(`Tab: route "${this.focusedRoute()?.name}" focused`);
      this.currentEmitter.emit(NAVIGATION_EVENT_FOCUS);
    }
    return this.currentEmitter;
  }

  tabBarDescriptor(): IDescriptor {
    const state = this.stateSignal();
    const routes = state?.routes ?? [];
    const focusedIndex = state?.index ?? 0;

    const items: ITabBarItemView[] = routes.map((route, index) => {
      const entry = this.registry.get(route.name);
      const focused = isFocusedRoute(index, focusedIndex);
      if (!entry) {
        dlog(`Tab: no screen registered for route name "${route.name}"`);
        return { key: route.key, focused, label: route.name, passthrough: {} };
      }
      const options = this.resolveTabOptions(entry, route);
      return {
        key: route.key,
        focused,
        label: options.tabBarLabel ?? options.title ?? route.name,
        icon: options.tabBarIcon,
        badge: options.tabBarBadge,
        activeTintColor: options.tabBarActiveTintColor,
        inactiveTintColor: options.tabBarInactiveTintColor,
        passthrough: {
          onPress: () => this.handle.jumpTo(route.name),
          accessibilityRole: 'tab',
          accessibilityState: { selected: focused },
        },
      };
    });

    const focusedRoute = this.focusedRoute();
    const focusedEntry = focusedRoute ? this.registry.get(focusedRoute.name) : undefined;
    const focusedOptions =
      focusedEntry && focusedRoute
        ? this.resolveTabOptions(focusedEntry, focusedRoute)
        : this.screenOptions;

    return renderTabBar({ items, style: focusedOptions?.tabBarStyle, passthrough: {} });
  }
}
