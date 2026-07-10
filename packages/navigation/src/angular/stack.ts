// Stack, the Angular lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Vue adapters; here Angular supplies the lifecycle — a signal for
// the pushed-route stack, a per-instance counter for route-key generation, push/pop/replace/... as
// plain public methods directly on the class (no `useImperativeHandle`/forwardRef equivalent
// needed: an Angular component instance IS its own "ref", same shape as MatDrawer.open(), reached
// via a template reference variable, e.g. `<Stack #nav>` then `nav.push(...)`; `Stack implements
// INavigatorHandle` so the instance itself is what gets handed to a screen's `navigation` input and
// to NavigationContextService) - plus the descriptor bridge for the header config leaf via the raw
// native-view element tags below. Pushing/popping a route is an ordinary child render/removal:
// RNSScreenStack diffs its RNSScreen children natively, so no imperative native command is needed
// here at all. Neither this nor ScreenDirective imports react-native-screens' own React components
// (hooks, crashes a non-React adapter); the native views are driven directly through the
// ViewConfig ../register registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.
//
// RAW NATIVE TAGS + NO_ERRORS_SCHEMA: RNSScreenStack/RNSScreen/RNSModalScreen/
// RNSScreenContentWrapper/RNSScreenStackHeaderConfig/RNSScreenStackHeaderSubview/RNSSearchBar are
// react-native-screens' native Fabric views, not Angular components — core's render-stack.ts
// deliberately hands back PLAIN PROPS OBJECTS for the leaves this adapter builds itself with real
// framework children (see its header comment), the same split react/stack.ts's `createElement`
// calls implement. A non-dashed raw tag name only satisfies Angular's DOM element schema check
// under `NO_ERRORS_SCHEMA` (`CUSTOM_ELEMENTS_SCHEMA` only relaxes tags containing a "-", confirmed
// against `.vendors/angular/packages/compiler/src/schema/dom_element_schema_registry.ts`'s
// `hasElement`) — every other Angular component in this codebase only ever names dashed
// `symbiote-*` primitives or real `@Component` selectors, so this is the first legitimate need for
// the looser schema in this codebase; every prop still routes through the real, declared
// `[symbioteHostProps]` input (primitives/shared.ts, `@symbiote-native/angular`), never a bare
// unknown-property binding.
//
// RESOLVED: `Stack` itself (like `Tab`/`Drawer`) is a composed Angular `@Component` used as a
// plain `<Stack>` tag by consuming app code. `adapters/angular/src/renderer.ts`'s
// `ANCHOR_HOST_COMPONENTS` allowlist lists `'Stack'`/`'Tab'`/`'Drawer'` — plus every
// `.examples/angular` navigation-demo screen/component that hits the same "composed @Component
// used as a plain tag" case, mounted either statically or via `NgComponentOutlet` — so a real
// device build paints correctly (unlisted, `createElement('Stack')` falls through to a real
// `createNode` call and RN paints its own "Unimplemented component" fallback instead) — the same
// allowlist `@symbiote-native/slider`'s `Slider` needed. Every raw react-native-screens tag above
// is correctly EXEMPT from that allowlist (they must fall through to a real `createNode` to paint
// at all).

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
import { Platform, dlog } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_STATE,
  RNS_MODAL_SCREEN_VIEW_NAME,
  SCREEN_ON_APPEAR,
  SCREEN_ON_DISAPPEAR,
  SCREEN_ON_DISMISSED,
  SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
  SEARCH_BAR_ON_BLUR,
  SEARCH_BAR_ON_CANCEL_BUTTON_PRESS,
  SEARCH_BAR_ON_CHANGE_TEXT,
  SEARCH_BAR_ON_CLOSE,
  SEARCH_BAR_ON_FOCUS,
  SEARCH_BAR_ON_OPEN,
  SEARCH_BAR_ON_SEARCH_BUTTON_PRESS,
  STACK_ON_FINISH_TRANSITIONING,
  computeActivityState,
  createInitialNavigatorState,
  createNavigationEmitter,
  isHeaderInModal,
  navigatorReducer,
  renderHeaderConfig,
  resolveHeaderConfigView,
  resolveHeaderInModalScreenStyle,
  resolveHeaderInModalStackStyle,
  resolveScreenContentWrapperStyle,
  resolveScreenProps,
  resolveScreenView,
  resolveScreenViewName,
  resolveSearchBarProps,
  resolveSearchBarView,
  resolveStackProps,
} from '../core';
import type {
  INavigationEmitter,
  INavigatorPlatform,
  INavigatorState,
  INavigatorAction,
  IRoute,
  ISearchBarCommands,
} from '../core';
import { NavigationScopeDirective } from './navigation-scope.directive';
import { SearchBarRefDirective } from './search-bar-ref.directive';
import { ScreenDirective } from './screen.directive';
import type { IAngularScreenOptions, IScreenComponentProps } from './screen.directive';

export type INavigatorHandle = {
  push: (name: string, params?: unknown) => void;
  pop: (count?: number) => void;
  popToTop: () => void;
  popTo: (key: string) => void;
  replace: (name: string, params?: unknown) => void;
  setParams: (params: unknown, key?: string) => void;
  reset: (state: INavigatorState) => void;
  canGoBack: () => boolean;
};

// backTitleVisible defaults to `true` on both platforms per the codegen spec's own default — no
// ios/android divergence in v1 scope (mirrors react/stack.ts's own constant exactly).
const NAVIGATOR_PLATFORM: INavigatorPlatform = { defaultHeaderBackTitleVisible: true };

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
      <RNSScreenStack [symbioteHostProps]="stackHostProps()">
        @for (route of currentState.routes; track route.key; let idx = $index) {
          <ng-container
            [ngTemplateOutlet]="screenTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: idx }"
          />
        }
      </RNSScreenStack>
    }

    <ng-template #screenTpl let-route let-index="index">
      @if (outerScreenIsModal(route)) {
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
      @if (isInModal(route)) {
        <RNSScreenStack [symbioteHostProps]="innerStackProps()">
          <RNSScreen [symbioteHostProps]="innerScreenProps(route, index)">
            <ng-container
              [ngTemplateOutlet]="headerAndContentTpl"
              [ngTemplateOutletContext]="{ $implicit: route }"
            />
          </RNSScreen>
        </RNSScreenStack>
      } @else {
        <ng-container
          [ngTemplateOutlet]="headerAndContentTpl"
          [ngTemplateOutletContext]="{ $implicit: route }"
        />
      }
    </ng-template>

    <ng-template #headerAndContentTpl let-route>
      <RNSScreenStackHeaderConfig [symbioteHostProps]="headerConfigProps(route)">
        @if (hasSearchBar(route)) {
          <RNSScreenStackHeaderSubview [symbioteHostProps]="headerSubviewProps">
            <RNSSearchBar
              [symbioteSearchBarRef]="searchBarRef(route)"
              [symbioteHostProps]="searchBarProps(route)"
            />
          </RNSScreenStackHeaderSubview>
        }
      </RNSScreenStackHeaderConfig>
      <RNSScreenContentWrapper [symbioteHostProps]="contentWrapperProps(route)">
        <ng-container
          [symbioteNavigationScope]="route"
          [navigation]="this"
          [emitter]="emitterFor(route.key)"
        >
          <ng-container
            *ngComponentOutlet="componentFor(route); inputs: screenComponentInputs(route)"
          />
        </ng-container>
      </RNSScreenContentWrapper>
    </ng-template>
  `,
})
export class Stack implements AfterContentInit, OnDestroy, INavigatorHandle {
  @ContentChildren(ScreenDirective) private readonly screenChildren!: QueryList<ScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: IAngularScreenOptions;

  readonly headerSubviewProps: Record<string, unknown> = { type: 'searchBar' };

  private readonly routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE ScreenDirective instance, not a snapshot copy of its fields:
  // @ContentChildren's `changes` Observable only fires on a STRUCTURAL change to the query
  // results (screens added/removed/reordered), never when an already-matched instance's own
  // `[options]`/`[component]` binding is merely reassigned a new value — a snapshot copy taken at
  // rebuild time would go stale the instant an app changes e.g. `[options]` on an existing
  // `<ng-template symbioteScreen>` without also adding/removing one. Reading straight off the
  // directive instance means Angular's own ordinary Input binding keeps every field live for free.
  private readonly registry = new Map<string, ScreenDirective>();
  private readonly emitters = new Map<string, INavigationEmitter>();
  private routeSequence = 0;
  private screenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<INavigatorState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();

  readonly push = (name: string, params?: unknown): void =>
    this.dispatch({ type: 'push', route: this.createRoute(name, params) });
  readonly pop = (count?: number): void => this.dispatch({ type: 'pop', count });
  readonly popToTop = (): void => this.dispatch({ type: 'popToTop' });
  readonly popTo = (key: string): void => this.dispatch({ type: 'popTo', key });
  readonly replace = (name: string, params?: unknown): void =>
    this.dispatch({ type: 'replace', route: this.createRoute(name, params) });
  readonly setParams = (params: unknown, key?: string): void =>
    this.dispatch({ type: 'setParams', key, params });
  readonly reset = (nextState: INavigatorState): void =>
    this.dispatch({ type: 'reset', state: nextState });
  readonly canGoBack = (): boolean => (this.stateSignal()?.routes.length ?? 0) > 1;

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.screenChildrenSubscription = this.screenChildren.changes.subscribe(() => {
      this.rebuildRegistry();
    });
  }

  ngOnDestroy(): void {
    this.screenChildrenSubscription?.unsubscribe();
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.screenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    const initialRouteName = this.initialRouteName ?? this.registry.keys().next().value;
    if (initialRouteName === undefined) {
      dlog('Stack: no <ng-template symbioteScreen> children registered');
      this.stateSignal.set(
        createInitialNavigatorState({ key: this.routeIdPrefix, name: '', params: undefined }),
      );
      return;
    }
    this.stateSignal.set(
      createInitialNavigatorState(
        this.createRoute(initialRouteName, this.registry.get(initialRouteName)?.initialParams),
      ),
    );
  }

  private createRoute(name: string, params: unknown): IRoute<unknown> {
    this.routeSequence += 1;
    return { key: `${this.routeIdPrefix}-${name}-${this.routeSequence}`, name, params };
  }

  private dispatch(action: INavigatorAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    const next = navigatorReducer(current, action);
    this.stateSignal.set(next);
    for (const route of next.routes) {
      this.emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, next);
    }
    for (const routeKey of this.emitters.keys()) {
      if (!next.routes.some(route => route.key === routeKey)) this.emitters.delete(routeKey);
    }
  }

  emitterFor(routeKey: string): INavigationEmitter {
    let emitter = this.emitters.get(routeKey);
    if (!emitter) {
      emitter = createNavigationEmitter();
      this.emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  private mergedOptionsFor(route: IRoute<unknown>): IAngularScreenOptions {
    const entry = this.registry.get(route.name);
    const screenComponentProps: IScreenComponentProps = { route, navigation: this };
    const own =
      entry === undefined
        ? undefined
        : typeof entry.options === 'function'
          ? entry.options(screenComponentProps)
          : entry.options;
    return { ...this.screenOptions, ...own };
  }

  componentFor(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  screenComponentInputs(route: IRoute<unknown>): IScreenComponentProps {
    return { route, navigation: this };
  }

  stackHostProps(): Record<string, unknown> {
    return resolveStackProps({
      passthrough: {
        [STACK_ON_FINISH_TRANSITIONING]: () =>
          dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
      },
    });
  }

  outerScreenIsModal(route: IRoute<unknown>): boolean {
    const stackPresentation = this.mergedOptionsFor(route).stackPresentation;
    return (
      resolveScreenViewName(stackPresentation, Platform.OS === 'android') ===
      RNS_MODAL_SCREEN_VIEW_NAME
    );
  }

  isInModal(route: IRoute<unknown>): boolean {
    const mergedOptions = this.mergedOptionsFor(route);
    return isHeaderInModal(
      mergedOptions.stackPresentation,
      mergedOptions.headerShown === false,
      Platform.OS === 'android',
    );
  }

  screenHostProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    const mergedOptions = this.mergedOptionsFor(route);
    const activityState = computeActivityState(index, this.stateSignal()?.routes.length ?? 1);
    return resolveScreenProps(
      resolveScreenView(route.key, activityState, mergedOptions, {
        [SCREEN_ON_DISMISSED]: () => this.dispatch({ type: 'pop', count: 1 }),
        [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: () => this.dispatch({ type: 'pop', count: 1 }),
        [SCREEN_ON_APPEAR]: () => {
          dlog(`Stack: route "${route.name}" appeared (focus)`);
          this.emitterFor(route.key).emit(NAVIGATION_EVENT_FOCUS);
        },
        [SCREEN_ON_DISAPPEAR]: () => {
          dlog(`Stack: route "${route.name}" disappeared (blur)`);
          this.emitterFor(route.key).emit(NAVIGATION_EVENT_BLUR);
        },
      }),
    );
  }

  innerStackProps(): Record<string, unknown> {
    return { style: resolveHeaderInModalStackStyle() };
  }

  innerScreenProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    return {
      style: resolveHeaderInModalScreenStyle(),
      activityState: computeActivityState(index, this.stateSignal()?.routes.length ?? 1),
    };
  }

  contentWrapperProps(route: IRoute<unknown>): Record<string, unknown> {
    const mergedOptions = this.mergedOptionsFor(route);
    return {
      style: resolveScreenContentWrapperStyle(
        mergedOptions.stackPresentation,
        mergedOptions.headerShown === false,
        mergedOptions.headerTranslucent,
        Platform.OS === 'android',
      ),
      collapsable: false,
    };
  }

  headerConfigProps(route: IRoute<unknown>): Record<string, unknown> {
    const mergedOptions = this.mergedOptionsFor(route);
    return renderHeaderConfig(resolveHeaderConfigView(mergedOptions, NAVIGATOR_PLATFORM)).props;
  }

  hasSearchBar(route: IRoute<unknown>): boolean {
    return this.mergedOptionsFor(route).headerSearchBarOptions !== undefined;
  }

  searchBarRef(route: IRoute<unknown>): { current: ISearchBarCommands | null } | undefined {
    return this.mergedOptionsFor(route).headerSearchBarOptions?.ref;
  }

  searchBarProps(route: IRoute<unknown>): Record<string, unknown> {
    const options = this.mergedOptionsFor(route).headerSearchBarOptions;
    if (!options) return {};
    return resolveSearchBarProps(
      resolveSearchBarView(options, {
        [SEARCH_BAR_ON_FOCUS]: () => options.onFocus?.(),
        [SEARCH_BAR_ON_BLUR]: () => options.onBlur?.(),
        [SEARCH_BAR_ON_CHANGE_TEXT]: (event: ISymbioteEvent) => {
          const { text } = event.nativeEvent;
          options.onChangeText?.(typeof text === 'string' ? text : '');
        },
        [SEARCH_BAR_ON_SEARCH_BUTTON_PRESS]: (event: ISymbioteEvent) => {
          const { text } = event.nativeEvent;
          options.onSearchButtonPress?.(typeof text === 'string' ? text : '');
        },
        [SEARCH_BAR_ON_CANCEL_BUTTON_PRESS]: () => options.onCancelButtonPress?.(),
        [SEARCH_BAR_ON_CLOSE]: () => options.onClose?.(),
        [SEARCH_BAR_ON_OPEN]: () => options.onOpen?.(),
      }),
    );
  }
}
