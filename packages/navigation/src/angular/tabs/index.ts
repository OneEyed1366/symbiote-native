// Tab, the Angular lifecycle half: a signal for the focused index, the class is the handle
// The bar is pure JS painted through `symbiote-descriptor-outlet`, so `../register` is not needed
// `<view>` has no dash, so `NO_ERRORS_SCHEMA` is required, the custom elements schema is not enough

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  QueryList,
  type AfterContentInit,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { DescriptorOutlet } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import {
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
import { createFixedRouteSignal } from '../fixed-route-signal';
import { createFocusedEmitter } from '../focused-emitter';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { TabScreenDirective } from '../tab-screen.directive';

export type { ITabNavigatorHandle } from '../../core';

const TAB_ROOT_STYLE = { flex: 1 };
const TAB_CONTENT_STYLE = { flex: 1 };

// Before the first screen registers there is no state, and the bar paints with no items
const EMPTY_TAB_STATE: ITabRouterState = { routes: [], index: 0 };

const TAB_ROUTER = {
  create: createInitialTabState,
  reconcile: reconcileTabRoutes,
  reduce: tabRouterReducer,
};

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
  private readonly registry = new Map<string, TabScreenDirective>();

  private readonly fixedRoutes = createFixedRouteSignal<
    ITabRouterState,
    ITabRouterAction
  >(
    TAB_ROUTER,
    this.routeIdPrefix,
    'Tab: no <ng-template symbioteTabScreen> children registered',
  );
  readonly state = this.fixedRoutes.state;

  private readonly focused = createFocusedEmitter('Tab', () =>
    this.focusedRoute(),
  );

  private readonly handle = createTabHandle(action =>
    this.fixedRoutes.dispatch(action),
  );
  readonly jumpTo = this.handle.jumpTo;
  readonly setParams = this.handle.setParams;

  ngAfterContentInit(): void {
    this.fixedRoutes.follow(
      this.tabScreenChildren,
      this.registry,
      () => this.initialRouteName,
    );
  }

  ngOnDestroy(): void {
    this.focused.dispose();
  }

  focusedRoute(): IRoute<unknown> | undefined {
    const state = this.state();
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
      state: this.state() ?? EMPTY_TAB_STATE,
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
