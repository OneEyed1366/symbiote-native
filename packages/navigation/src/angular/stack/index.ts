// Stack, the Angular lifecycle half: a signal holds the pushed routes and the class itself is the
// `INavigatorHandle`, so a template reference variable reaches `push`/`pop` like `MatDrawer.open()`
// The transitions and prop folds live in core and are shared with the other adapters

// The native screens views are raw tags, driven through the ViewConfig that `../register` sets up
// Importing the React components of react-native-screens would crash a non-React adapter
// A non-dashed tag passes the DOM schema check only under `NO_ERRORS_SCHEMA`

// `Stack` is a composed component, so it self-registers: `babel-register-composed.cjs` finds its
// `ngDeclareComponent` selector at bundle time and calls `registerComposedComponent('Stack')`
// Vitest skips that pipeline, so `stack.test.ts` registers it by hand

// The raw screens tags are exempt, they must reach `createNode` to paint at all

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  inject,
  QueryList,
  signal,
  type AfterContentInit,
  type OnDestroy,
  type TemplateRef,
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
  createTransitionProgressStore,
  mergeScreenOptions,
  navigatorReducer,
  reconcileStackRoutes,
  resolveCustomHeaderSubviews,
  resolveCustomHeaderViews,
  resolveHeaderInModalStackStyle,
  resolveHeaderSubviewProps,
  resolveNativeContainerProps,
  resolveSheetFooterHost,
  resolveStackRoutePlan,
} from '../../core';
import type {
  IHeaderSubviewHost,
  ISheetFooterHost,
  INativeContainerStyle,
  INavigatorHandle,
  INavigatorState,
  INavigatorAction,
  IRoute,
  IScreenRenderPlan,
} from '../../core';
import { NavigationContextService } from '../navigation-context.service';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { SearchBarRefDirective } from '../search-bar-ref.directive';
import { ScreenDirective } from '../screen.directive';
import type { IAngularScreenOptions } from '../screen.directive';

export type { INavigatorHandle } from '../../core';

let stackInstanceCounter = 0;

// An input transform, so the bound container style folds into the host props once per change
function foldStackHostProps(
  style: INativeContainerStyle | undefined,
): Record<string, unknown> {
  return { ...buildStackHostProps(), ...resolveNativeContainerProps(style) };
}

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
      @if (plan(route, index).screenViewName === modalScreenViewName) {
        <RNSModalScreen [symbioteHostProps]="plan(route, index).screenProps">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSModalScreen>
      } @else {
        <RNSScreen [symbioteHostProps]="plan(route, index).screenProps">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSScreen>
      }
    </ng-template>

    <ng-template #innerTpl let-route let-index="index">
      @if (plan(route, index).inModal) {
        <RNSScreenStack [symbioteHostProps]="innerStackProps">
          <RNSScreen [symbioteHostProps]="plan(route, index).innerScreenProps">
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
      @let options = mergedOptionsFor(route);
      <RNSScreenStackHeaderConfig
        [symbioteHostProps]="plan(route, index).headerConfig.props"
      >
        @if (options.headerSearchBarOptions; as searchBar) {
          <RNSScreenStackHeaderSubview [symbioteHostProps]="headerSubviewProps">
            <RNSSearchBar
              [symbioteSearchBarRef]="searchBar.ref"
              [symbioteHostProps]="plan(route, index).searchBarProps ?? {}"
            />
          </RNSScreenStackHeaderSubview>
        }
        @for (subview of headerSubviews(options); track subview.host.kind) {
          <RNSScreenStackHeaderSubview [symbioteHostProps]="subview.host.props">
            @if (subview.host.imageProps; as imageProps) {
              <image [symbioteHostProps]="imageProps" />
            } @else {
              <ng-container [ngTemplateOutlet]="subview.view ?? null" />
            }
          </RNSScreenStackHeaderSubview>
        }
      </RNSScreenStackHeaderConfig>
      <RNSScreenContentWrapper
        [symbioteHostProps]="plan(route, index).contentWrapperProps"
      >
        @if (plan(route, index).safeAreaHost; as safeArea) {
          <RNSSafeAreaView [symbioteHostProps]="safeArea.props">
            <ng-container
              [ngTemplateOutlet]="scopedTpl"
              [ngTemplateOutletContext]="{ $implicit: route, index: index }"
            />
          </RNSSafeAreaView>
        } @else {
          <ng-container
            [ngTemplateOutlet]="scopedTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        }
      </RNSScreenContentWrapper>
      @if (sheetFooterHost(options); as footer) {
        <RNSScreenFooter [symbioteHostProps]="footer.props">
          <ng-container [ngTemplateOutlet]="options.sheetFooter ?? null" />
        </RNSScreenFooter>
      }
    </ng-template>

    <ng-template #scopedTpl let-route let-index="index">
      <ng-container
        [symbioteNavigationScope]="route"
        [navigation]="this"
        [emitter]="emitterFor(route.key)"
        [transitionProgress]="transitionProgressFor(route.key)"
        [edgeInsets]="plan(route, index).edgeInsets"
      >
        <ng-container *ngComponentOutlet="componentFor(route)" />
      </ng-container>
    </ng-template>
  `,
})
export class Stack implements AfterContentInit, OnDestroy, INavigatorHandle {
  @ContentChildren(ScreenDirective)
  private readonly screenChildren!: QueryList<ScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: IAngularScreenOptions;

  readonly headerSubviewProps = resolveHeaderSubviewProps('searchBar');
  readonly innerStackProps = { style: resolveHeaderInModalStackStyle() };
  readonly modalScreenViewName = RNS_MODAL_SCREEN_VIEW_NAME;

  // The scope of the screen this Stack sits in, the nesting root has none
  private readonly ambientScope = inject(NavigationContextService, {
    optional: true,
  });
  private readonly routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;
  // Keyed by name to the LIVE `ScreenDirective`, not a copy of its fields: the query `changes`
  // stream fires on structural changes only, so a copy would go stale when `[options]` is rebound
  private readonly registry = new Map<string, ScreenDirective>();
  private readonly createRoute = createRouteFactory(this.routeIdPrefix);
  private readonly emitterStore = createEmitterStore();
  readonly emitterFor = this.emitterStore.emitterFor;
  private readonly transitionProgressStore = createTransitionProgressStore();
  // One value set per route key, so the scope and the plan's event handler drive the same values
  readonly transitionProgressFor = this.transitionProgressStore.forRoute;
  // Keyed by `${route.key}:${index}` and cleared on every dispatch, so the template bindings
  // resolve one plan per state change instead of one each
  private readonly planCache = new Map<string, IScreenRenderPlan>();
  private readonly loggedPropKeys = new Set<string>();
  private screenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<INavigatorState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();
  @Input({ alias: 'nativeContainerStyle', transform: foldStackHostProps })
  stackHostProps = foldStackHostProps(undefined);

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

  // A `<ng-template symbioteScreen>` marker can leave the query while its route is still pushed
  // The signal write lives here, in the query callback, since reconciliation reacts to the
  // registry and is never derived from it
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

  // The one write path into `stateSignal`, for a dispatched action and a registry reconciliation
  // Both drop the plan cache, broadcast to the live routes and prune the emitters of gone ones
  private commitState(next: INavigatorState): void {
    this.planCache.clear();
    this.stateSignal.set(next);
    this.emitterStore.broadcastState(next);
    this.transitionProgressStore.keepOnly(next.routes.map(route => route.key));
  }

  mergedOptionsFor(route: IRoute<unknown>): IAngularScreenOptions {
    return mergeScreenOptions(
      this.registry.get(route.name)?.options,
      { route, navigation: this },
      this.screenOptions,
    );
  }

  componentFor(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  // The template reads one field per binding, so the plan is cached per route and index
  // The search bar ref rides `[symbioteSearchBarRef]`, which is why the plan gets no handle setter
  plan(route: IRoute<unknown>, index: number): IScreenRenderPlan {
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
      parentScope: this.ambientScope ?? undefined,
      transitionProgress: this.transitionProgressFor(route.key),
    });
    this.planCache.set(cacheKey, plan);
    return plan;
  }

  // Core says whether this screen has a footer, the template outlets the app content in its host
  sheetFooterHost(
    options: IAngularScreenOptions,
  ): ISheetFooterHost | undefined {
    return resolveSheetFooterHost({
      stackPresentation: options.stackPresentation,
      hasFooter: options.sheetFooter !== undefined,
    });
  }

  // Each app header view next to the leaf that hosts it, core decides which leaves exist
  headerSubviews(
    options: IAngularScreenOptions,
  ): { host: IHeaderSubviewHost; view: TemplateRef<unknown> | undefined }[] {
    const views = resolveCustomHeaderViews(options);
    return resolveCustomHeaderSubviews(views, options).map(host => ({
      host,
      view: views[host.kind],
    }));
  }
}
