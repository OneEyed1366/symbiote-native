// Tab, the Angular lifecycle half. The focused-index router (tab-router-state) and the tab-bar
// Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim with
// the React/Vue adapters; here Angular supplies the lifecycle - a signal for the focused index, a
// per-instance counter for route-key generation, `jumpTo`/`setParams` as plain public methods
// directly on the class (no ref forwarding needed, see stack.ts's header, same reasoning: `Tab
// implements ITabNavigatorHandle`) - plus the descriptor bridge (`symbiote-descriptor-outlet`,
// `@symbiote-native/angular`) for the tab-bar leaf, exactly like Stack bridges its header config.
// Unlike Stack, a bottom-tabs bar is a PURE-JS UI: it paints
// ordinary `view`/`text` primitives via the shared render fn, so there is no
// react-native-screens ViewConfig to register - Tab needs no `../register` import.
//
// RAW NATIVE TAGS + NO_ERRORS_SCHEMA (see stack.ts's identical header note): `<view>` is a
// non-dashed raw tag, and `CUSTOM_ELEMENTS_SCHEMA` only relaxes tags containing a "-" (confirmed
// against `.vendors/angular/packages/compiler/src/schema/dom_element_schema_registry.ts`'s
// `hasElement`) — it does NOT rescue this the way it does `symbiote-*`-prefixed selectors. The
// previous `View` import (`ViewHost` re-exported under that alias) never actually matched `<view>`
// here despite the identical selector — device-observed via `ngc`, not `tsc`/vitest — and was
// removed as dead (ngc's own NG8113 flagged it unused).
//
// RESOLVED (see stack.ts's header, identical reasoning): `'Tab'` has an `ANCHOR_HOST_COMPONENTS`
// entry in `adapters/angular/src/renderer.ts`, so a real device build paints `<Tab>` correctly as
// a nested tag.

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  QueryList,
  signal,
  type AfterContentInit,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { dlog } from '@symbiote-native/engine';
import { DescriptorOutlet } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import {
  buildFixedRoutes,
  buildTabBarItems,
  createInitialTabState,
  createTabHandle,
  reconcileTabRoutes,
  renderTabBar,
  resolveFocusedTabOptions,
  tabRouterReducer,
} from '../../core';
import type {
  INavigationEmitter,
  IRoute,
  ITabBarInput,
  ITabNavigatorHandle,
  ITabOptions,
  ITabRouterAction,
  ITabRouterState,
} from '../../core';
import { createFocusedEmitter } from '../focused-emitter';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { TabScreenDirective } from '../tab-screen.directive';

export type { ITabNavigatorHandle } from '../../core';

const TAB_ROOT_STYLE = { flex: 1 };
const TAB_CONTENT_STYLE = { flex: 1 };

// Before the first screen registers there is no state, and the bar paints with no items
const EMPTY_TAB_STATE: ITabRouterState = { routes: [], index: 0 };

let tabInstanceCounter = 0;

@Component({
  selector: 'Tab',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [NgComponentOutlet, NavigationScopeDirective, DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <view [style]="rootStyle">
      <view [style]="contentStyle">
        @if (focusedRoute(); as route) {
          @if (componentForRoute(route); as component) {
            <ng-container
              [symbioteNavigationScope]="route"
              [navigation]="this"
              [emitter]="focusedRouteEmitter()"
            >
              <ng-container *ngComponentOutlet="component" />
            </ng-container>
          }
        }
      </view>
      <symbiote-descriptor-outlet [node]="tabBarDescriptor()" />
    </view>
  `,
})
export class Tab implements AfterContentInit, OnDestroy, ITabNavigatorHandle {
  @ContentChildren(TabScreenDirective)
  private readonly tabScreenChildren!: QueryList<TabScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: ITabOptions;

  readonly rootStyle = TAB_ROOT_STYLE;
  readonly contentStyle = TAB_CONTENT_STYLE;

  private readonly routeIdPrefix = `tab-${(tabInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE TabScreenDirective instance - see stack.ts's matching comment for
  // why a snapshot copy would go stale on an in-place `[options]`/`[component]` change.
  private readonly registry = new Map<string, TabScreenDirective>();
  private tabScreenChildrenSubscription:
    { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<ITabRouterState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();

  private readonly focused = createFocusedEmitter('Tab', () =>
    this.focusedRoute(),
  );

  private readonly handle = createTabHandle(action => this.dispatch(action));
  readonly jumpTo = this.handle.jumpTo;
  readonly setParams = this.handle.setParams;

  ngAfterContentInit(): void {
    this.syncRegistry();
    this.tabScreenChildrenSubscription =
      this.tabScreenChildren.changes.subscribe(() => {
        this.syncRegistry();
      });
  }

  ngOnDestroy(): void {
    this.tabScreenChildrenSubscription?.unsubscribe();
    this.focused.dispose();
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.tabScreenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  // A marker can appear or leave after mount, so the routes follow the live query
  // `reconcileTabRoutes` keeps each survivor's key and params. Not a computed: it writes a signal
  private syncRegistry(): void {
    this.rebuildRegistry();
    const routes = buildFixedRoutes(this.registry, this.routeIdPrefix);
    if (routes.length === 0)
      dlog('Tab: no <ng-template symbioteTabScreen> children registered');
    const current = this.stateSignal();
    if (current !== undefined) {
      this.stateSignal.set(reconcileTabRoutes(current, routes));
      return;
    }
    // Seeding an empty list would lose `initialRouteName`, so wait for the first marker
    if (routes.length === 0) return;
    this.stateSignal.set(createInitialTabState(routes, this.initialRouteName));
  }

  private dispatch(action: ITabRouterAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    this.stateSignal.set(tabRouterReducer(current, action));
  }

  focusedRoute(): IRoute<unknown> | undefined {
    const state = this.stateSignal();
    return state?.routes[state.index];
  }

  componentForRoute(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  focusedRouteEmitter(): INavigationEmitter {
    return this.focused.emitter();
  }

  tabBarDescriptor(): IDescriptor {
    const bar: ITabBarInput<TabScreenDirective> = {
      state: this.stateSignal() ?? EMPTY_TAB_STATE,
      handle: this,
      entryFor: name => this.registry.get(name),
      optionsOf: entry => entry.options,
      screenOptions: this.screenOptions,
    };
    return renderTabBar({
      items: buildTabBarItems(bar),
      style: resolveFocusedTabOptions(bar)?.tabBarStyle,
      passthrough: {},
    });
  }
}
