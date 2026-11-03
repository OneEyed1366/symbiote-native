// NativeTab, the Angular lifecycle half: a signal for the router, native reports dispatch into it
// The host, screen and accessory decisions live in core, shared with every other adapter

// A tag cannot be dynamic in a template, so a switch picks the one view core named
// The native views are raw tags, driven through the ViewConfigs that `../register` sets up

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  QueryList,
  type AfterContentInit,
  type TemplateRef,
  type Type,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { Platform, SymbioteHostPropsDirective } from '@symbiote-native/angular';
import {
  createEmitterStore,
  createInitialNativeTabState,
  createTabHandle,
  nativeTabReducer,
  reconcileNativeTabRoutes,
} from '../../core';
import type {
  INativeTabState,
  INativeTabsView,
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
  INativeTabAction,
  IRoute,
  ITabNavigatorHandle,
  ITabsBottomAccessoryEnvironment,
} from '../../core';
import { planNativeTabs } from '../../core/native-tabs-renderer';
import { createFixedRouteSignal } from '../fixed-route-signal';
import { NativeTabScreenDirective } from '../native-tab-screen.directive';
import { NavigationScopeDirective } from '../navigation-scope.directive';

export type INativeTabNavigatorHandle = ITabNavigatorHandle;

// React's `ios.bottomAccessory(environment)` becomes a template that gets the environment
export type INativeTabBottomAccessory = TemplateRef<{
  $implicit: ITabsBottomAccessoryEnvironment;
}>;

const NATIVE_TAB_ROUTER = {
  create: createInitialNativeTabState,
  reconcile: reconcileNativeTabRoutes,
  reduce: nativeTabReducer,
};

let nativeTabInstanceCounter = 0;

@Component({
  selector: 'NativeTab',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    NgComponentOutlet,
    NgTemplateOutlet,
    NavigationScopeDirective,
    SymbioteHostPropsDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as currentState) {
      @let view = plan(currentState);
      @switch (view.host.viewName) {
        @case ('RNSTabsHostIOS') {
          <RNSTabsHostIOS [symbioteHostProps]="view.host.props">
            <ng-container
              [ngTemplateOutlet]="body"
              [ngTemplateOutletContext]="{ $implicit: view }"
            />
          </RNSTabsHostIOS>
        }
        @case ('RNSTabsHostAndroid') {
          <RNSTabsHostAndroid [symbioteHostProps]="view.host.props">
            <ng-container
              [ngTemplateOutlet]="body"
              [ngTemplateOutletContext]="{ $implicit: view }"
            />
          </RNSTabsHostAndroid>
        }
        @default {
          <view [symbioteHostProps]="view.host.props">
            <ng-container
              [ngTemplateOutlet]="body"
              [ngTemplateOutletContext]="{ $implicit: view }"
            />
          </view>
        }
      }
    }

    <ng-template #body let-view>
      @for (item of view.screens; track item.route.key) {
        @switch (item.screen.viewName) {
          @case ('RNSTabsScreenIOS') {
            <RNSTabsScreenIOS [symbioteHostProps]="item.screen.props">
              <ng-container
                [ngTemplateOutlet]="content"
                [ngTemplateOutletContext]="{ $implicit: item.route }"
              />
            </RNSTabsScreenIOS>
          }
          @case ('RNSTabsScreenAndroid') {
            <RNSTabsScreenAndroid [symbioteHostProps]="item.screen.props">
              <ng-container
                [ngTemplateOutlet]="content"
                [ngTemplateOutletContext]="{ $implicit: item.route }"
              />
            </RNSTabsScreenAndroid>
          }
          @default {
            <view [symbioteHostProps]="item.screen.props">
              <ng-container
                [ngTemplateOutlet]="content"
                [ngTemplateOutletContext]="{ $implicit: item.route }"
              />
            </view>
          }
        }
      }
      @if (view.bottomAccessory; as accessory) {
        <RNSTabsBottomAccessory [symbioteHostProps]="accessory.props">
          @for (part of accessory.contents; track part.environment) {
            <RNSTabsBottomAccessoryContent [symbioteHostProps]="part.props">
              <ng-container
                [ngTemplateOutlet]="bottomAccessory ?? null"
                [ngTemplateOutletContext]="{ $implicit: part.environment }"
              />
            </RNSTabsBottomAccessoryContent>
          }
        </RNSTabsBottomAccessory>
      }
    </ng-template>

    <ng-template #content let-route>
      <ng-container
        [symbioteNavigationScope]="route"
        [navigation]="this"
        [emitter]="emitterFor(route.key)"
      >
        <ng-container *ngComponentOutlet="componentFor(route)" />
      </ng-container>
    </ng-template>
  `,
})
export class NativeTab implements AfterContentInit, ITabNavigatorHandle {
  @ContentChildren(NativeTabScreenDirective)
  private readonly screenChildren!: QueryList<NativeTabScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: INativeTabsViewScreenOptions;
  @Input() host: INativeTabsViewHostOptions = {};
  @Input() bottomAccessory?: INativeTabBottomAccessory;

  private readonly registry = new Map<string, NativeTabScreenDirective>();
  private readonly fixedRoutes = createFixedRouteSignal<
    INativeTabState,
    INativeTabAction
  >(
    NATIVE_TAB_ROUTER,
    `native-tab-${(nativeTabInstanceCounter += 1)}`,
    'NativeTab: no <ng-template symbioteNativeTabScreen> children registered',
  );

  readonly state = this.fixedRoutes.state;
  readonly emitterFor = createEmitterStore().emitterFor;

  private readonly handle = createTabHandle(action =>
    this.fixedRoutes.dispatch(action),
  );
  readonly jumpTo = this.handle.jumpTo;
  readonly setParams = this.handle.setParams;

  ngAfterContentInit(): void {
    this.fixedRoutes.follow(
      this.screenChildren,
      this.registry,
      () => this.initialRouteName,
    );
  }

  plan(state: INativeTabState): INativeTabsView {
    return planNativeTabs(Platform, {
      registry: this.registry,
      state,
      dispatch: action => this.fixedRoutes.dispatch(action),
      handle: this,
      host: this.host,
      screenOptions: this.screenOptions,
      bottomAccessory: this.bottomAccessory,
      parent: undefined,
      emitterFor: this.emitterFor,
    });
  }

  componentFor(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }
}
