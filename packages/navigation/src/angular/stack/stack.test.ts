// Co-located Angular-driven test (ADR 0025) for the @symbiote-native/navigation Angular Stack.
// Proves the shared core drives Angular correctly against an INJECTED codegen-shaped ViewConfig
// (mirrors packages/navigation/src/react/stack.test.tsx and
// adapters/angular/src/components/switch/switch.test.ts's mount/unmount harness - this codebase's
// Angular tests drive the real renderer via `mount`/`unmount`, not TestBed). Stack/ScreenDirective
// are imported from their own modules (NOT the package barrel, './index') so the third-party
// native-spec side-effect (../register) never loads headless.
//
// Route-stack REDUCER logic (navigatorReducer's push/pop/popToTop/popTo/replace/setParams/reset
// transitions) is core's responsibility and has its own canonical, framework-free coverage in
// core/navigator-state.test.ts (mirrors react/stack/stack.test.tsx's identical scoping decision -
// see its own header comment). This file only proves Angular's dispatch->signal->template WIRING
// works, which push/pop/setParams/reset below already establish as one pattern; popToTop/popTo/
// replace go through that exact same private `dispatch()` method (see index.ts), so they are N/A
// here rather than re-proving the same wiring a third/fourth/fifth time.
//
// No Negative group: Stack has no guard clause of its own that throws - "refuses to pop the last
// route" is a no-op the reducer already fails closed on (core's own contract, proven by
// navigator-state.test.ts's "no-op on a single-route stack" case), observed here only as an
// unchanged screen count, not a thrown error.

import '@angular/compiler';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
  ViewChild,
  signal,
  type Signal,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  registerComposedComponent,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { ScreenDirective } from '../screen.directive';
import { injectRoute } from '../injectors';
import type { INavigatorState, IRoute, ISearchBarCommands } from '../../core';

const ROOT_TAG = 5120;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';

function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

const RNS_SCREEN_VIEW_CONFIG: INativeViewConfig = {
  directEventTypes: {
    topAppear: directEvent('onAppear'),
    topDisappear: directEvent('onDisappear'),
    topDismissed: directEvent('onDismissed'),
    topHeaderBackButtonClicked: directEvent('onHeaderBackButtonClicked'),
  },
  validAttributes: {
    screenId: true,
    activityState: true,
    stackAnimation: true,
    stackPresentation: true,
  },
};

const RNS_SCREEN_STACK_VIEW_CONFIG: INativeViewConfig = {
  directEventTypes: {
    topFinishTransitioning: directEvent('onFinishTransitioning'),
  },
  validAttributes: {},
};

const RNS_HEADER_CONFIG_VIEW_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { title: true, hidden: true, backTitleVisible: true },
};

const RNS_SEARCH_BAR_VIEW_CONFIG: INativeViewConfig = {
  directEventTypes: { topChangeText: directEvent('onChangeText') },
  validAttributes: { placeholder: true },
};

const MODAL_SCREEN_VIEW = 'RNSModalScreen';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [STACK_VIEW]: RNS_SCREEN_STACK_VIEW_CONFIG,
  [HEADER_CONFIG_VIEW]: RNS_HEADER_CONFIG_VIEW_CONFIG,
  [SEARCH_BAR_VIEW]: RNS_SEARCH_BAR_VIEW_CONFIG,
  // Same prop/event surface as a plain RNSScreen (resolveScreenRenderPlan's screenProps don't
  // differ by outer tag) - only WHICH tag gets mounted differs, which is exactly what the modal
  // test below proves.
  [MODAL_SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
// On a real Metro build, adapters/angular's babel-register-composed.cjs auto-registers `Stack`
// as an anchor host by scanning the AOT-compiled @Component's selector - vitest never runs that
// pipeline, so this test drives the same self-registration entry point by hand (mirrors
// renderer.test.ts's 'RefApiDemo' convention). Without it, `<Stack>` falls through to a raw
// Fabric createNode('Stack') call instead of a non-painting anchor.
registerComposedComponent('Stack');

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findInTree(predicate, node.children);
    if (found) return found;
  }
  return undefined;
}

function screenNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === SCREEN_VIEW) found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

function headerConfigOf(screen: IFakeNode): IFakeNode {
  const header = screen.children.find(
    child => child.viewName === HEADER_CONFIG_VIEW,
  );
  if (!header) throw new Error('no header config child on screen');
  return header;
}

@Component({
  selector: 'home-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class HomeScreenComponent {}

@Component({
  selector: 'details-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>details</symbiote-text>`,
})
class DetailsScreenComponent {}

// Each mounted instance captures its own live route Signal (injectRoute) in order - index 0 is
// Home, index 1 the pushed Details - so a test reads params/key straight off the screen's DI-
// provided route instead of a former @Input, and a setParams still updates it reactively.
const capturedParamRoutes: Signal<IRoute<unknown>>[] = [];

@Component({
  selector: 'params-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>params</symbiote-text>`,
})
class ParamsScreenComponent {
  constructor() {
    capturedParamRoutes.push(injectRoute());
  }
}

let capturedHost: StackTestHost | undefined;

@Component({
  selector: 'stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="homeOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Details"
        [component]="detailsComponent"
      ></ng-template>
    </Stack>
  `,
})
class StackTestHost {
  @ViewChild('nav') nav!: Stack;

  homeComponent = HomeScreenComponent;
  detailsComponent = DetailsScreenComponent;
  homeOptions: Record<string, unknown> = { title: 'Home' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountStack(): Promise<INavigatorHandle> {
  capturedHost = undefined;
  mount(ROOT_TAG, StackTestHost);
  await tick();
  const host = capturedHost;
  if (!host) throw new Error('StackTestHost never mounted');
  return host.nav;
}

// Dedicated hosts (fixed component wiring declared up front, mirroring react/stack.test.tsx's
// per-test `createElement(...)` calls) for the params/setParams/search-bar scenarios below -
// swapping a `[component]`/`[options]` binding value on an already-mounted host AFTER `mount()`
// is a real but separate correctness question (does a bare, non-signal field write on the host
// get picked up by the next CD pass at all); sidestepped here by declaring the desired wiring
// once, up front, exactly like every other test in this file already does.

let capturedParamsHost: ParamsStackTestHost | undefined;

@Component({
  selector: 'params-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [initialParams]="homeInitialParams"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Details"
        [component]="detailsComponent"
      ></ng-template>
    </Stack>
  `,
})
class ParamsStackTestHost {
  @ViewChild('nav') nav!: Stack;

  homeComponent = ParamsScreenComponent;
  detailsComponent = ParamsScreenComponent;
  homeInitialParams: unknown = { tab: 'feed' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedParamsHost = this;
  }
}

async function mountParamsStack(): Promise<INavigatorHandle> {
  capturedParamsHost = undefined;
  mount(ROOT_TAG, ParamsStackTestHost);
  await tick();
  const host = capturedParamsHost;
  if (!host) throw new Error('ParamsStackTestHost never mounted');
  return host.nav;
}

@Component({
  selector: 'search-bar-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="homeOptions"
      ></ng-template>
    </Stack>
  `,
})
class SearchBarStackTestHost {
  @ViewChild('nav') nav!: Stack;

  homeComponent = HomeScreenComponent;
  @Input() homeOptions: Record<string, unknown> = {
    title: 'Home',
    headerSearchBarOptions: { placeholder: 'Search' },
  };
}

@Component({
  selector: 'modal-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="homeOptions"
      ></ng-template>
    </Stack>
  `,
})
class ModalStackTestHost {
  @ViewChild('nav') nav!: Stack;

  homeComponent = HomeScreenComponent;
  @Input() homeOptions: Record<string, unknown> = {
    title: 'Home',
    stackPresentation: 'modal',
  };
}

@Component({
  selector: 'profile-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>profile</symbiote-text>`,
})
class ProfileScreenComponent {}

let capturedDynamicHost: DynamicStackTestHost | undefined;

// A host whose marker set SHRINKS at runtime - the Angular shape of "a <Stack.Screen> behind an
// @if", which StackTestHost's fixed template cannot express.
@Component({
  selector: 'dynamic-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
      ></ng-template>
      @if (isDetailsRegistered()) {
        <ng-template
          symbioteScreen
          name="Details"
          [component]="detailsComponent"
        ></ng-template>
      }
      <ng-template
        symbioteScreen
        name="Profile"
        [component]="profileComponent"
      ></ng-template>
    </Stack>
  `,
})
class DynamicStackTestHost {
  @ViewChild('nav') nav!: Stack;

  readonly isDetailsRegistered = signal(true);
  homeComponent = HomeScreenComponent;
  detailsComponent = DetailsScreenComponent;
  profileComponent = ProfileScreenComponent;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedDynamicHost = this;
  }
}

async function mountDynamicStack(): Promise<INavigatorHandle> {
  capturedDynamicHost = undefined;
  mount(ROOT_TAG, DynamicStackTestHost);
  await tick();
  const host = capturedDynamicHost;
  if (!host) throw new Error('DynamicStackTestHost never mounted');
  return host.nav;
}

describe('Angular Stack navigator', () => {
  it('mounts only the initial route as an RNSScreen, focused, with its header title', async () => {
    await mountStack();
    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(fabric.find(n => n.viewName === STACK_VIEW)).toBeDefined();
    expect(headerConfigOf(screens[0]).props.title).toBe('Home');
  });

  it('push() mounts a second RNSScreen and keeps both at activityState 2', async () => {
    const handle = await mountStack();
    handle.push('Details');
    await tick();
    const screens = screenNodes();
    expect(screens).toHaveLength(2);
    expect(screens[0].props.activityState).toBe(2);
    expect(screens[1].props.activityState).toBe(2);
    expect(handle.canGoBack()).toBe(true);
  });

  it('pop() unmounts back down to the previous route', async () => {
    const handle = await mountStack();
    handle.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);
    handle.pop();
    await tick();
    expect(screenNodes()).toHaveLength(1);
    expect(handle.canGoBack()).toBe(false);
  });

  it('refuses to pop the last route', async () => {
    const handle = await mountStack();
    handle.pop();
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onDismissed event (iOS swipe/interactive dismiss)', async () => {
    const handle = await mountStack();
    handle.push('Details');
    await tick();
    const top = screenNodes()[1];
    fabric.fireEvent(top.instanceHandle, 'topDismissed', { dismissCount: 1 });
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onHeaderBackButtonClicked event', async () => {
    const handle = await mountStack();
    handle.push('Details');
    await tick();
    const top = screenNodes()[1];
    fabric.fireEvent(top.instanceHandle, 'topHeaderBackButtonClicked', {});
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('mounts the registered screen component as the RNSScreen content', async () => {
    await mountStack();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
    ).toBeDefined();
  });

  it('exposes route.params to the pushed screen via injectRoute', async () => {
    capturedParamRoutes.length = 0;
    const handle = await mountParamsStack();
    handle.push('Details', { id: 42 });
    await tick();
    expect(capturedParamRoutes.at(-1)?.().params).toEqual({ id: 42 });
  });

  it('setParams() merges onto the focused route without changing the stack shape', async () => {
    capturedParamRoutes.length = 0;
    const handle = await mountParamsStack();
    handle.push('Details', { id: 1 });
    await tick();
    handle.setParams({ id: 2 });
    await tick();
    expect(capturedParamRoutes.at(-1)?.().params).toEqual({ id: 2 });
    expect(screenNodes()).toHaveLength(2);
  });

  it('setParams() targets a route by key when given, not just the focused one', async () => {
    capturedParamRoutes.length = 0;
    const handle = await mountParamsStack();
    // Home mounts first (ParamsScreenComponent, initialParams: {tab:'feed'}), capturing its route.
    const homeRoute = capturedParamRoutes[0];
    if (homeRoute === undefined)
      throw new Error('home route was never captured');
    const homeKey = homeRoute().key;
    handle.push('Details');
    await tick();
    handle.setParams({ tab: 'search' }, homeKey);
    await tick();
    expect(homeRoute().params).toEqual({ tab: 'search' });
  });

  it('reset() replaces the whole stack with the given state', async () => {
    const handle = await mountStack();
    handle.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);

    const nextState: INavigatorState = {
      routes: [{ key: 'reset-1', name: 'Details', params: { id: 7 } }],
    };
    handle.reset(nextState);
    await tick();

    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(handle.canGoBack()).toBe(false);
  });

  it('nests an RNSSearchBar child, wrapped in an RNSScreenStackHeaderSubview, when headerSearchBarOptions is set', async () => {
    mount(ROOT_TAG, SearchBarStackTestHost, {
      initialProps: {
        homeOptions: {
          title: 'Home',
          headerSearchBarOptions: { placeholder: 'Search' },
        },
      },
    });
    await tick();
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(1);
    const subview = header.children[0];
    expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
    expect(subview.props.type).toBe('searchBar');
    expect(subview.children).toHaveLength(1);
    expect(subview.children[0].viewName).toBe(SEARCH_BAR_VIEW);
    expect(subview.children[0].props.placeholder).toBe('Search');
  });

  it('drives imperative SearchBarCommands (focus/setText/…) through the app-supplied ref', async () => {
    const searchBarRef: { current: ISearchBarCommands | null } = {
      current: null,
    };
    mount(ROOT_TAG, SearchBarStackTestHost, {
      initialProps: {
        homeOptions: {
          title: 'Home',
          headerSearchBarOptions: { placeholder: 'Search', ref: searchBarRef },
        },
      },
    });
    await tick();

    expect(searchBarRef.current).not.toBeNull();
    searchBarRef.current?.focus();
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'focus',
      args: [],
    });
    searchBarRef.current?.setText('preset');
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'setText',
      args: ['preset'],
    });
  });

  it('renders the header config with zero children when there is no search bar', async () => {
    await mountStack();
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(0);
  });

  // why: a modally-presented screen has no UINavigationController on iOS (render-stack.ts's
  // isHeaderInModal comment) - RNSScreenStackHeaderConfig has nothing to attach a native nav bar
  // to unless the template nests header + content inside a SECOND, inner RNSScreenStack/RNSScreen
  // pair purely to host it. outerScreenIsModal/isInModal (Stack's template-bound methods) exist
  // specifically to pick this branch; a plain 'push' screen (every other test in this file) never
  // exercises it, so this is the only place either method's `true` path is proven at all.
  it('a modal screen mounts as RNSModalScreen and nests its header inside an inner RNSScreenStack', async () => {
    mount(ROOT_TAG, ModalStackTestHost);
    await tick();

    const outer = findInTree(n => n.viewName === MODAL_SCREEN_VIEW);
    if (!outer) throw new Error('no RNSModalScreen mounted');

    const innerStack = outer.children.find(
      child => child.viewName === STACK_VIEW,
    );
    if (!innerStack)
      throw new Error('no inner RNSScreenStack nested inside the modal screen');
    const innerScreen = innerStack.children.find(
      child => child.viewName === SCREEN_VIEW,
    );
    if (!innerScreen)
      throw new Error('no inner RNSScreen nested inside the inner stack');
    // The only RNSScreen anywhere is this inner one - the OUTER screen mounted as RNSModalScreen
    // instead, exactly the substitution outerScreenIsModal exists to make.
    expect(screenNodes()).toEqual([innerScreen]);
    expect(headerConfigOf(innerScreen).props.title).toBe('Home');
  });

  // why: the route list is navigation HISTORY, not a projection of the @ContentChildren query, so
  // a marker that leaves the query while its route is still pushed used to leave a phantom entry.
  // Angular feels that worst of the four: its template mounts an RNSScreen per route regardless,
  // so componentFor() returning null paints a REAL, EMPTY native screen - a blank screen the user
  // is parked on with no way to tell what happened.
  it('drops a pushed route whose screen marker leaves the content query', async () => {
    const handle = await mountDynamicStack();
    handle.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);

    capturedDynamicHost?.isDetailsRegistered.set(false);
    await tick();

    expect(screenNodes()).toHaveLength(1);
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
    ).toBeDefined();
    expect(
      findInTree(
        n => n.viewName === 'RCTRawText' && n.props.text === 'details',
      ),
    ).toBeUndefined();
    expect(handle.canGoBack()).toBe(false);
  });

  // why: the pruning must be PERSISTED into the state signal, not recomputed per read - a phantom
  // left in the signal has the next push rebuild the stack on top of it, and the user then has to
  // press back TWICE to leave a route they only visited once.
  it('keeps the pruned history when a new route is pushed afterwards', async () => {
    const handle = await mountDynamicStack();
    handle.push('Details');
    await tick();
    capturedDynamicHost?.isDetailsRegistered.set(false);
    await tick();
    handle.push('Profile');
    await tick();
    handle.pop();
    await tick();

    expect(screenNodes()).toHaveLength(1);
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
    ).toBeDefined();
    expect(handle.canGoBack()).toBe(false);
  });
});
