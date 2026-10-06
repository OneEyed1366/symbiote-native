// Stack, the Angular lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Vue adapters; here Angular supplies the lifecycle - a signal for
// the pushed-route stack, a per-instance counter for route-key generation, push/pop/replace/... as
// plain public methods directly on the class (no `useImperativeHandle`/forwardRef equivalent
// needed: an Angular component instance IS its own "ref", same shape as MatDrawer.open(), reached
// via a template reference variable, e.g. `<Stack #nav>` then `nav.push(...)`; `Stack implements
// INavigatorHandle` so the instance itself is what NavigationScopeDirective hands to
// NavigationContextService - the DI scope every mounted screen reads its navigation/route from via
// injectStackNavigation()/injectRoute(), never a component input) - plus the descriptor bridge for
// the header config leaf via the raw
// native-view element tags below. Pushing/popping a route is an ordinary child render/removal:
// RNSScreenStack diffs its RNSScreen children natively, so no imperative native command is needed
// here at all. Neither this nor ScreenDirective imports react-native-screens' own React components
// (hooks, crashes a non-React adapter); the native views are driven directly through the
// ViewConfig ../register registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.
//
// RAW NATIVE TAGS + NO_ERRORS_SCHEMA: RNSScreenStack/RNSScreen/RNSModalScreen/
// RNSScreenContentWrapper/RNSScreenStackHeaderConfig/RNSScreenStackHeaderSubview/RNSSearchBar are
// react-native-screens' native Fabric views, not Angular components - core's render-stack.ts
// deliberately hands back PLAIN PROPS OBJECTS for the leaves this adapter builds itself with real
// framework children (see its header comment), the same split react/stack.ts's `createElement`
// calls implement. A non-dashed raw tag name only satisfies Angular's DOM element schema check
// under `NO_ERRORS_SCHEMA` (`CUSTOM_ELEMENTS_SCHEMA` only relaxes tags containing a "-", confirmed
// against `.vendors/angular/packages/compiler/src/schema/dom_element_schema_registry.ts`'s
// `hasElement`) - every other Angular component in this codebase only ever names dashed
// `symbiote-*` primitives or real `@Component` selectors, so this is the first legitimate need for
// the looser schema in this codebase; every prop still routes through the real, declared
// `[symbioteHostProps]` input (primitives/shared.ts, `@symbiote-native/angular`), never a bare
// unknown-property binding.
//
// RESOLVED: `Stack` itself (like `Tab`/`Drawer`) is a composed Angular `@Component` used as a
// plain `<Stack>` tag by consuming app code. It is NOT hardcoded into `adapters/angular/src/
// renderer/index.ts`'s `ANCHOR_HOST_COMPONENTS` Set - as an app/package-owned selector it
// self-registers instead: `adapters/angular/babel-register-composed.cjs` (a Metro babel preset
// applied bundle-wide, not scoped to adapters/angular) scans this package's own AOT-compiled
// (`ngc`) `ɵɵngDeclareComponent({selector: 'Stack', ...})` output and auto-calls
// `registerComposedComponent('Stack')` at bundle time - same mechanism `examples/angular`
// navigation-demo screens and `@symbiote-native/slider`'s `Slider` rely on for their own composed
// components mounted statically or via `NgComponentOutlet`. Unregistered, `createElement('Stack')`
// falls through to a real `createNode` call and RN paints its own "Unimplemented component"
// fallback instead. vitest never runs that Metro/babel pipeline, so `stack.test.ts` calls
// `registerComposedComponent('Stack')` itself. Every raw react-native-screens tag above is
// correctly EXEMPT from this mechanism (they must fall through to a real `createNode` to paint at
// all).

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
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import {
  RNS_MODAL_SCREEN_VIEW_NAME,
  buildInitialState,
  buildStackHostProps,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  mergeScreenOptions,
  navigatorReducer,
  reconcileStackRoutes,
  resolveHeaderInModalStackStyle,
  resolveStackRoutePlan,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorState,
  INavigatorAction,
  IRoute,
  ISearchBarCommands,
  IScreenRenderPlan,
} from '../../core';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { SearchBarRefDirective } from '../search-bar-ref.directive';
import { ScreenDirective } from '../screen.directive';
import type { IAngularScreenOptions } from '../screen.directive';

export type { INavigatorHandle } from '../../core';

let stackInstanceCounter = 0;

@Component({
  selector: 'Stack',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    NgTemplateOutlet,
    NgComponentOutlet,
    NavigationScopeDirective,
    SearchBarRefDirective,
    SymbioteHostPropsDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as currentState) {
      <RNSScreenStack [symbioteHostProps]="stackHostProps">
        @for (route of currentState.routes; track route.key; let idx = $index) {
          <ng-container
            [ngTemplateOutlet]="screenTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: idx }"
          />
        }
      </RNSScreenStack>
    }

    <ng-template #screenTpl let-route let-index="index">
      @if (outerScreenIsModal(route, index)) {
        <RNSModalScreen [symbioteHostProps]="screenHostProps(route, index)">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSModalScreen>
      } @else {
        <RNSScreen [symbioteHostProps]="screenHostProps(route, index)">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSScreen>
      }
    </ng-template>

    <ng-template #innerTpl let-route let-index="index">
      @if (isInModal(route, index)) {
        <RNSScreenStack [symbioteHostProps]="innerStackProps()">
          <RNSScreen [symbioteHostProps]="innerScreenProps(route, index)">
            <ng-container
              [ngTemplateOutlet]="headerAndContentTpl"
              [ngTemplateOutletContext]="{ $implicit: route, index: index }"
            />
          </RNSScreen>
        </RNSScreenStack>
      } @else {
        <ng-container
          [ngTemplateOutlet]="headerAndContentTpl"
          [ngTemplateOutletContext]="{ $implicit: route, index: index }"
        />
      }
    </ng-template>

    <ng-template #headerAndContentTpl let-route let-index="index">
      <RNSScreenStackHeaderConfig
        [symbioteHostProps]="headerConfigProps(route, index)"
      >
        @if (hasSearchBar(route)) {
          <RNSScreenStackHeaderSubview [symbioteHostProps]="headerSubviewProps">
            <RNSSearchBar
              [symbioteSearchBarRef]="searchBarRef(route)"
              [symbioteHostProps]="searchBarProps(route, index)"
            />
          </RNSScreenStackHeaderSubview>
        }
      </RNSScreenStackHeaderConfig>
      <RNSScreenContentWrapper
        [symbioteHostProps]="contentWrapperProps(route, index)"
      >
        <ng-container
          [symbioteNavigationScope]="route"
          [navigation]="this"
          [emitter]="emitterFor(route.key)"
        >
          <ng-container *ngComponentOutlet="componentFor(route)" />
        </ng-container>
      </RNSScreenContentWrapper>
    </ng-template>
  `,
})
export class Stack implements AfterContentInit, OnDestroy, INavigatorHandle {
  @ContentChildren(ScreenDirective)
  private readonly screenChildren!: QueryList<ScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: IAngularScreenOptions;

  readonly headerSubviewProps: Record<string, unknown> = { type: 'searchBar' };

  private readonly routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE ScreenDirective instance, not a snapshot copy of its fields:
  // @ContentChildren's `changes` Observable only fires on a STRUCTURAL change to the query
  // results (screens added/removed/reordered), never when an already-matched instance's own
  // `[options]`/`[component]` binding is merely reassigned a new value - a snapshot copy taken at
  // rebuild time would go stale the instant an app changes e.g. `[options]` on an existing
  // `<ng-template symbioteScreen>` without also adding/removing one. Reading straight off the
  // directive instance means Angular's own ordinary Input binding keeps every field live for free.
  private readonly registry = new Map<string, ScreenDirective>();
  private readonly createRoute = createRouteFactory(this.routeIdPrefix);
  private readonly emitterStore = createEmitterStore();
  readonly emitterFor = this.emitterStore.emitterFor;
  // Keyed by `${route.key}:${index}`, cleared on every dispatch: the ~7 template-bound
  // accessors below (outerScreenIsModal/isInModal/screenHostProps/...) all resolve the SAME
  // route+index through planFor per change-detection cycle, so caching here turns ~7 runs of
  // the 14-step resolveScreenRenderPlan chain into 1 per actual state change.
  private readonly planCache = new Map<string, IScreenRenderPlan>();
  private readonly loggedPropKeys = new Set<string>();
  private screenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<INavigatorState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();
  readonly stackHostProps = buildStackHostProps();

  private readonly handle = createStackHandle(
    action => this.dispatch(action),
    this.createRoute,
    () => (this.stateSignal()?.routes.length ?? 0) > 1,
  );
  readonly push = this.handle.push;
  readonly pop = this.handle.pop;
  readonly popToTop = this.handle.popToTop;
  readonly popTo = this.handle.popTo;
  readonly replace = this.handle.replace;
  readonly setParams = this.handle.setParams;
  readonly reset = this.handle.reset;
  readonly canGoBack = this.handle.canGoBack;

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.screenChildrenSubscription = this.screenChildren.changes.subscribe(
      () => {
        this.rebuildRegistry();
      },
    );
  }

  ngOnDestroy(): void {
    this.screenChildrenSubscription?.unsubscribe();
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.screenChildren) {
      this.registry.set(screen.name, screen);
    }
    this.reconcileWithRegistry();
  }

  // A `<ng-template symbioteScreen>` marker can leave the @ContentChildren query (a marker behind
  // an `@if`, a data-driven screen list) while its route is still in the pushed history, which
  // would leave that entry with nothing for componentFor() to mount (reconcileStackRoutes' header).
  // The signal write lives HERE, in the query-change callback, and never in a computed/template
  // accessor - reconciliation is a reaction to the registry changing, not a derivation of it.
  private reconcileWithRegistry(): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    const next = reconcileStackRoutes(current, [...this.registry.keys()]);
    if (next === current) return;
    this.commitState(next);
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    this.stateSignal.set(
      buildInitialState(
        this.registry,
        this.initialRouteName,
        this.routeIdPrefix,
        this.createRoute,
      ),
    );
  }

  private dispatch(action: INavigatorAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    this.commitState(navigatorReducer(current, action));
  }

  // The one write path into stateSignal, shared by a dispatched action and a registry-driven
  // reconciliation: both invalidate the plan cache, broadcast to every still-live route, and prune
  // the emitters of routes that are gone.
  private commitState(next: INavigatorState): void {
    this.planCache.clear();
    this.stateSignal.set(next);
    this.emitterStore.broadcastState(next);
  }

  private mergedOptionsFor(route: IRoute<unknown>): IAngularScreenOptions {
    return mergeScreenOptions(
      this.registry.get(route.name)?.options,
      { route, navigation: this },
      this.screenOptions,
    );
  }

  componentFor(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  // The template reads one field per accessor, so the plan is cached per route and index
  // The search bar ref rides `[symbioteSearchBarRef]`, which is why the plan gets no handle setter
  private planFor(route: IRoute<unknown>, index: number): IScreenRenderPlan {
    const cacheKey = `${route.key}:${index}`;
    const cached = this.planCache.get(cacheKey);
    if (cached) return cached;
    const plan = resolveStackRoutePlan({
      route,
      index,
      routeCount: this.stateSignal()?.routes.length ?? 1,
      options: this.mergedOptionsFor(route),
      emitter: this.emitterFor(route.key),
      onPop: () => this.dispatch({ type: 'pop', count: 1 }),
      loggedKeys: this.loggedPropKeys,
    });
    this.planCache.set(cacheKey, plan);
    return plan;
  }

  outerScreenIsModal(route: IRoute<unknown>, index: number): boolean {
    return (
      this.planFor(route, index).screenViewName === RNS_MODAL_SCREEN_VIEW_NAME
    );
  }

  isInModal(route: IRoute<unknown>, index: number): boolean {
    return this.planFor(route, index).inModal;
  }

  screenHostProps(
    route: IRoute<unknown>,
    index: number,
  ): Record<string, unknown> {
    return this.planFor(route, index).screenProps;
  }

  innerStackProps(): Record<string, unknown> {
    return { style: resolveHeaderInModalStackStyle() };
  }

  innerScreenProps(
    route: IRoute<unknown>,
    index: number,
  ): Record<string, unknown> {
    const plan = this.planFor(route, index);
    return { style: plan.innerScreenStyle, activityState: plan.activityState };
  }

  contentWrapperProps(
    route: IRoute<unknown>,
    index: number,
  ): Record<string, unknown> {
    return this.planFor(route, index).contentWrapperProps;
  }

  headerConfigProps(
    route: IRoute<unknown>,
    index: number,
  ): Record<string, unknown> {
    return this.planFor(route, index).headerConfig.props;
  }

  hasSearchBar(route: IRoute<unknown>): boolean {
    return this.mergedOptionsFor(route).headerSearchBarOptions !== undefined;
  }

  searchBarRef(
    route: IRoute<unknown>,
  ): { current: ISearchBarCommands | null } | undefined {
    return this.mergedOptionsFor(route).headerSearchBarOptions?.ref;
  }

  searchBarProps(
    route: IRoute<unknown>,
    index: number,
  ): Record<string, unknown> {
    return this.planFor(route, index).searchBarProps ?? {};
  }
}
