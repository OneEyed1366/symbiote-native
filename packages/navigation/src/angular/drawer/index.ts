// Drawer, the Angular lifecycle half. The open/closed + focused-route router
// (drawer-router-state) and the pure swipe/geometry math (drawer-options) live in
// @symbiote-native/navigation core, shared verbatim with the React/Vue adapters; here Angular
// supplies the lifecycle - a signal-backed router, a PanResponder (RN's own idiom, framework-
// agnostic per `@symbiote-native/engine` - built ONCE as a class field, callbacks read LIVE `this`
// state at call time, no ref-mirroring dance needed the way react/drawer.ts's `useRef`s are: a
// class instance already gives every callback a live view of current state, closing the exact gap
// React's own hook rules force it to work around), an Animated.Value driving the slide/opacity
// transforms via the real `AnimatedView` component (`@symbiote-native/angular`), and
// `openDrawer`/`closeDrawer`/`toggleDrawer`/`jumpTo` as plain public methods directly on the class,
// mirroring tabs.ts's shape (Tab is the closer sibling: both are fixed-route-list,
// no-react-native-screens navigators; Stack's push/pop + native-screen bridging don't apply here;
// `Drawer implements IDrawerNavigatorHandle`).
//
// FEASIBILITY NOTE (mirrors react/drawer.ts's own header): the REAL @react-navigation/drawer is
// built on react-native-gesture-handler + react-native-reanimated, neither of which this codebase
// depends on. This reaches the same swipe-to-open/close + front/back/slide/permanent behavior with
// only PanResponder + Animated, sufficient for a solid drawer but NOT byte-for-byte parity - same
// explicit gap list as react/drawer.ts's tail comment (not repeated here, nothing Angular-specific
// changes it).
//
// RESOLVED (see stack.ts's header, identical reasoning): `'Drawer'` has an `ANCHOR_HOST_COMPONENTS`
// entry in `adapters/angular/src/renderer.ts`, so a real device build paints `<Drawer>` correctly
// as a nested tag. `AnimatedView`, imported below, was already anchor-hosted.
//
// RAW NATIVE TAGS + NO_ERRORS_SCHEMA (see stack.ts's and tabs.ts's identical header note):
// `<view>` is a non-dashed raw tag, and `CUSTOM_ELEMENTS_SCHEMA` only relaxes tags containing a
// "-" (confirmed against `.vendors/angular/packages/compiler/src/schema/
// dom_element_schema_registry.ts`'s `hasElement`). The previous `View` import (`ViewHost`
// re-exported under that alias) never actually matched `<view>` here despite the identical
// selector — device-observed via `ngc`, not `tsc`/vitest — and was removed as dead (ngc's own
// NG8113 flagged it unused).
//
// DRAWER CONTENT PROJECTION: react/drawer.ts's `renderDrawerContent` is a render-PROP callback
// (`(props) => ReactNode`) - per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>, a
// render-callback returning a framework element is inherently per-adapter. Angular's own idiom for
// "a caller-supplied template that needs live data" is a `TemplateRef` + `NgTemplateOutlet` with a
// context object, NOT a callback @Input(): `<Drawer><ng-template #drawerContent let-ctx>...
// {{ ctx.state }}...</ng-template></Drawer>`, read here via `@ContentChild('drawerContent', {read:
// TemplateRef})`.

import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  QueryList,
  TemplateRef,
  computed,
  inject,
  signal,
  type AfterContentInit,
  type OnChanges,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import {
  dlog,
  flattenStyle,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  Animated,
  AnimatedView,
  SymbioteHostPropsDirective,
  WindowDimensionsService,
} from '@symbiote-native/angular';
import {
  buildDrawerDescriptors,
  buildFixedRoutes,
  createDrawerController,
  createInitialDrawerRouterState,
  drawerRouterReducer,
  planDrawer,
} from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerPosition,
  IDrawerRouterAction,
  IDrawerRouterState,
  IDrawerSlotPlan,
  IDrawerType,
  INavigationEmitter,
  IRoute,
} from '../../core';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { DrawerScreenDirective } from '../drawer-screen.directive';
import { createFocusedEmitter } from '../focused-emitter';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

export type IDrawerContentContext = {
  $implicit: {
    state: IDrawerRouterState;
    descriptors: IDrawerDescriptorMap;
    navigation: IDrawerNavigatorHandle;
  };
};

// Stands in until `ngAfterContentInit` has seeded the state from the registered screens
const EMPTY_DRAWER_STATE = createInitialDrawerRouterState([], undefined);

let drawerInstanceCounter = 0;

@Component({
  selector: 'Drawer',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    NgComponentOutlet,
    NgTemplateOutlet,
    NavigationScopeDirective,
    SymbioteHostPropsDirective,
    AnimatedView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as currentState) {
      <view [style]="rootStyle()" [symbioteHostProps]="rootPanHandlers()">
        @for (slotPlan of slotPlans(); track slotPlan.slot) {
          @switch (slotPlan.slot) {
            @case ('content') {
              <AnimatedView
                [style]="slotStyle(slotPlan)"
                [animatedProps]="slotAnimatedProps(slotPlan)"
              >
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
              </AnimatedView>
            }
            @case ('overlay') {
              <AnimatedView
                [style]="slotStyle(slotPlan)"
                [animatedProps]="slotAnimatedProps(slotPlan)"
              />
            }
            @case ('panel') {
              <AnimatedView
                [style]="slotStyle(slotPlan)"
                [animatedProps]="slotAnimatedProps(slotPlan)"
              >
                @if (drawerContentTemplate) {
                  <ng-container
                    *ngTemplateOutlet="
                      drawerContentTemplate;
                      context: drawerContentContext(currentState)
                    "
                  />
                }
              </AnimatedView>
            }
          }
        }
      </view>
    }
  `,
})
export class Drawer
  implements AfterContentInit, OnChanges, OnDestroy, IDrawerNavigatorHandle
{
  @ContentChildren(DrawerScreenDirective)
  private readonly drawerScreenChildren!: QueryList<DrawerScreenDirective>;
  @ContentChild('drawerContent', { read: TemplateRef })
  drawerContentTemplate?: TemplateRef<IDrawerContentContext>;

  @Input() initialRouteName?: string;
  @Input() drawerStyle?: IStyleProp<IViewStyle>;
  @Input() drawerType?: IDrawerType;
  @Input() drawerPosition?: IDrawerPosition;
  @Input() drawerWidth?: number;
  @Input() overlayColor?: string;
  @Input() swipeEnabled?: boolean;
  @Input() swipeEdgeWidth?: number;
  @Input() swipeMinDistance?: number;
  @Input() swipeMinVelocity?: number;

  private readonly windowDimensions = inject(WindowDimensionsService)
    .dimensions;

  private readonly routeIdPrefix = `drawer-${(drawerInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE DrawerScreenDirective instance - see stack.ts's matching comment
  // for why a snapshot copy would go stale on an in-place `[options]`/`[component]` change.
  private readonly registry = new Map<string, DrawerScreenDirective>();
  private drawerScreenChildrenSubscription:
    { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<IDrawerRouterState | undefined>(
    undefined,
  );
  readonly state = this.stateSignal.asReadonly();

  private readonly focused = createFocusedEmitter('Drawer', () =>
    this.focusedRoute(),
  );

  // Always closed at first, since the state does not exist before `ngAfterContentInit`
  private readonly controller = createDrawerController({
    animated: Animated,
    readState: () => this.stateSignal() ?? EMPTY_DRAWER_STATE,
    dispatch: action => this.dispatch(action),
    readOptions: () => this.optionsSnapshot(),
    readWindowWidth: () => this.windowDimensions().width,
  });
  private readonly progress = this.controller.progress;
  readonly panResponder = this.controller.panResponder;

  readonly openDrawer = this.controller.handle.openDrawer;
  readonly closeDrawer = this.controller.handle.closeDrawer;
  readonly toggleDrawer = this.controller.handle.toggleDrawer;
  readonly jumpTo = this.controller.handle.jumpTo;

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.drawerScreenChildrenSubscription =
      this.drawerScreenChildren.changes.subscribe(() => {
        this.rebuildRegistry();
      });
  }

  ngOnDestroy(): void {
    this.drawerScreenChildrenSubscription?.unsubscribe();
    this.focused.dispose();
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.drawerScreenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    const routes = buildFixedRoutes(this.registry, this.routeIdPrefix);
    if (routes.length === 0)
      dlog('Drawer: no <ng-template symbioteDrawerScreen> children registered');
    this.stateSignal.set(
      createInitialDrawerRouterState(routes, this.initialRouteName),
    );
  }

  private dispatch(action: IDrawerRouterAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    this.stateSignal.set(drawerRouterReducer(current, action));
  }

  // A plain writable signal, not a computed() - it mirrors @Input() properties, which are ordinary
  // mutable fields Angular assigns directly rather than signals, so a computed() reading them would
  // never register them as a tracked dependency and would go stale after its first evaluation.
  // ngOnChanges (below) pushes every input change in here instead, which drawerRoot/slotsMap CAN
  // track correctly since reading a signal (unlike a plain field) IS visible to computed()'s
  // dependency collection.
  private readonly optionsSnapshot = signal<IDrawerOptions>(
    this.buildOptionsSnapshot(),
  );
  private readonly drawerStyleSnapshot = signal<
    IStyleProp<IViewStyle> | undefined
  >(this.drawerStyle);

  ngOnChanges(): void {
    this.optionsSnapshot.set(this.buildOptionsSnapshot());
    this.drawerStyleSnapshot.set(this.drawerStyle);
  }

  private buildOptionsSnapshot(): IDrawerOptions {
    return {
      drawerType: this.drawerType,
      drawerPosition: this.drawerPosition,
      drawerWidth: this.drawerWidth,
      overlayColor: this.overlayColor,
      swipeEnabled: this.swipeEnabled,
      swipeEdgeWidth: this.swipeEdgeWidth,
      swipeMinDistance: this.swipeMinDistance,
      swipeMinVelocity: this.swipeMinVelocity,
    };
  }

  // Recomputed only when a dependency signal changes, so the template reads in one pass share it
  private readonly plan = computed(() =>
    planDrawer({
      state: this.stateSignal() ?? EMPTY_DRAWER_STATE,
      options: this.optionsSnapshot(),
      drawerStyle: this.drawerStyleSnapshot(),
      progress: this.progress,
      closeDrawer: this.closeDrawer,
    }),
  );

  slotPlans(): readonly IDrawerSlotPlan[] {
    return this.plan().slots;
  }

  rootStyle(): Record<string, unknown> {
    return flattenStyle(this.plan().rootStyle);
  }

  rootPanHandlers(): Record<string, unknown> {
    return { ...this.panResponder.panHandlers };
  }

  slotAnimatedProps(slotPlan: IDrawerSlotPlan): Record<string, unknown> {
    const { style: _style, ...rest } = slotPlan.descriptor.props;
    return rest;
  }

  slotStyle(slotPlan: IDrawerSlotPlan): Record<string, unknown> {
    return flattenStyle([
      slotPlan.descriptor.props.style,
      slotPlan.animatedStyle,
    ]);
  }

  focusedRoute(): IRoute<unknown> | undefined {
    const state = this.stateSignal();
    return state?.routes[state.index];
  }

  focusedRouteEmitter(): INavigationEmitter {
    return this.focused.emitter();
  }

  componentForRoute(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  drawerContentContext(
    currentState: IDrawerRouterState,
  ): IDrawerContentContext {
    const descriptors: IDrawerDescriptorMap = buildDrawerDescriptors({
      state: currentState,
      handle: this,
      entryFor: name => this.registry.get(name),
      optionsOf: entry => entry.options,
    });
    return {
      $implicit: { state: currentState, descriptors, navigation: this },
    };
  }
}
