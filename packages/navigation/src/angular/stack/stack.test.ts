// Angular `Stack` against an injected codegen-shaped ViewConfig, driven through `mount` and not
// TestBed. Imported from `./index`, not the package barrel, so `../register` never loads headless

// Reducer transitions are core's own tests, this file proves the dispatch to signal to template
// wiring. `popToTop`, `popTo` and `replace` share the private `dispatch()` that push and pop cover

// No Negative group: popping the last route is a no-op the reducer already fails closed on

import '@angular/compiler';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
  ViewChild,
  signal,
  type Signal,
  type TemplateRef,
  type Type,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  registerComposedComponent,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import {
  childrenOf,
  isAnchor,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { ScreenDirective } from '../screen.directive';
import type { IAngularScreenOptions } from '../screen.directive';
import { injectRoute } from '../injectors';
import type {
  INavigatorState,
  IRoute,
  IScreenOptionsResolver,
  ISearchBarCommands,
} from '../../core';

const ROOT_TAG = 5_120;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';
const SHEET_FOOTER_VIEW = 'RNSScreenFooter';

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
  validAttributes: { nativeContainerBackgroundColor: true },
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
  // Same props and events as a plain RNSScreen, only the mounted tag differs
  [MODAL_SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [SHEET_FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
// Metro registers `Stack` as an anchor host at bundle time, vitest skips that step
// Without this call `<Stack>` would reach Fabric as a raw `Stack` node
registerComposedComponent('Stack');

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Half this file is about pops, so walks descend the live child links from the stack container
// A recording keeps popped screens too, only the tree says one is gone
function stackRoot(): ISymbioteNode {
  const stack = fabric.find(node => node.viewName === STACK_VIEW);
  if (stack === undefined) throw new Error('no screen stack created');
  return stack.handle;
}

// Anchors are flattened, as the commit walk does: bookkeeping nothing native ever sees
// The counts below mean native children, an anchor costs none
function kidsOf(node: IAuthoredNode): IAuthoredNode[] {
  const walk = (handle: ISymbioteNode): IAuthoredNode[] => {
    const kids: IAuthoredNode[] = [];
    for (const child of childrenOf(handle)) {
      if (isAnchor(child)) {
        kids.push(...walk(child));
        continue;
      }
      const recorded = fabric.find(one => one.handle === child);
      if (recorded !== undefined) kids.push(recorded);
    }
    return kids;
  };
  return walk(node.handle);
}

function liveNodes(handle: ISymbioteNode = stackRoot()): IAuthoredNode[] {
  const found: IAuthoredNode[] = [];
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(one => one.handle === child);
    if (recorded !== undefined) found.push(recorded);
    found.push(...liveNodes(child));
  }
  return found;
}

function findInTree(
  predicate: (node: IAuthoredNode) => boolean,
): IAuthoredNode | undefined {
  return liveNodes().find(predicate);
}

function screenNodes(): IAuthoredNode[] {
  return liveNodes().filter(node => node.viewName === SCREEN_VIEW);
}

function headerConfigOf(screen: IAuthoredNode): IAuthoredNode {
  const header = kidsOf(screen).find(
    child => child.viewName === HEADER_CONFIG_VIEW,
  );
  if (!header) throw new Error('no header config child on screen');
  return header;
}

@Component({
  selector: 'home-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>home</text>`,
})
class HomeScreenComponent {}

@Component({
  selector: 'details-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>details</text>`,
})
class DetailsScreenComponent {}

// Each mounted screen captures its own `injectRoute` signal in order, Home first, then Details
// A test reads params and key off it, and `setParams` still updates it
const capturedParamRoutes: Signal<IRoute<unknown>>[] = [];

@Component({
  selector: 'params-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>params</text>`,
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

// Dedicated hosts declare their wiring up front for the params and search bar cases
// Rebinding `[component]` or `[options]` after `mount()` is a separate question, avoided here

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

let capturedResolverHost: ResolverStackTestHost | undefined;

@Component({
  selector: 'resolver-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="resolver"
      ></ng-template>
    </Stack>
  `,
})
class ResolverStackTestHost {
  @ViewChild('nav') nav!: Stack;

  homeComponent = HomeScreenComponent;
  resolver: IScreenOptionsResolver = ({ route }) => ({
    title: String(route.params ?? 'none'),
  });

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedResolverHost = this;
  }
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

type IHeaderTemplates = Record<
  'left' | 'right' | 'title',
  TemplateRef<unknown>
>;

// The options hold `TemplateRef`s that only the host's own template can name, so a case supplies
// a builder and the host calls it once with its three templates
let buildHeaderOptions: (
  templates: IHeaderTemplates,
) => IAngularScreenOptions = () => ({});

@Component({
  selector: 'header-views-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ng-template #left><view testID="custom-left"></view></ng-template>
    <ng-template #right><view testID="custom-right"></view></ng-template>
    <ng-template #title><view testID="custom-title"></view></ng-template>
    <Stack initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="optionsWith(left, right, title)"
      ></ng-template>
    </Stack>
  `,
})
class HeaderViewsStackTestHost {
  homeComponent = HomeScreenComponent;
  private cachedOptions: IAngularScreenOptions | undefined;

  optionsWith(
    left: TemplateRef<unknown>,
    right: TemplateRef<unknown>,
    title: TemplateRef<unknown>,
  ): IAngularScreenOptions {
    this.cachedOptions ??= buildHeaderOptions({ left, right, title });
    return this.cachedOptions;
  }
}

// The footer option holds a `TemplateRef` only the host's own template can name, as above
let buildFooterOptions: (
  footer: TemplateRef<unknown>,
) => IAngularScreenOptions = () => ({});

@Component({
  selector: 'sheet-footer-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ng-template #footer><view testID="custom-footer"></view></ng-template>
    <Stack initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
        [options]="optionsWith(footer)"
      ></ng-template>
    </Stack>
  `,
})
class SheetFooterStackTestHost {
  homeComponent = HomeScreenComponent;
  private cachedOptions: IAngularScreenOptions | undefined;

  optionsWith(footer: TemplateRef<unknown>): IAngularScreenOptions {
    this.cachedOptions ??= buildFooterOptions(footer);
    return this.cachedOptions;
  }
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
  selector: 'container-style-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Home" [nativeContainerStyle]="containerStyle">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
      ></ng-template>
    </Stack>
  `,
})
class ContainerStyleStackTestHost {
  homeComponent = HomeScreenComponent;
  containerStyle = { backgroundColor: '#112233' };
}

@Component({
  selector: 'profile-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>profile</text>`,
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

type IForScreen = { name: string; component: Type<unknown> };

let capturedForHost: ForStackTestHost | undefined;

// The screen list comes from data, the shape an app takes to register a table of screens
@Component({
  selector: 'for-stack-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      @for (screen of screens; track screen.name) {
        <ng-template
          symbioteScreen
          [name]="screen.name"
          [component]="screen.component"
        ></ng-template>
      }
    </Stack>
  `,
})
class ForStackTestHost {
  @ViewChild('nav') nav!: Stack;

  readonly screens: readonly IForScreen[] = [
    { name: 'Home', component: HomeScreenComponent },
    { name: 'Details', component: DetailsScreenComponent },
  ];

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedForHost = this;
  }
}

async function mountForStack(): Promise<INavigatorHandle> {
  capturedForHost = undefined;
  mount(ROOT_TAG, ForStackTestHost);
  await tick();
  const host = capturedForHost;
  if (!host) throw new Error('ForStackTestHost never mounted');
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

  it('paints the stack container with nativeContainerStyle.backgroundColor', async () => {
    mount(ROOT_TAG, ContainerStyleStackTestHost);
    await tick();

    const stack = fabric.find(node => node.viewName === STACK_VIEW);
    expect(stack?.props.nativeContainerBackgroundColor).toBeDefined();
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

  // A demo panel steers the header with route params, so `setParams` has to re-run the resolver
  it('setParams() re-runs an options resolver, the header follows the params', async () => {
    capturedResolverHost = undefined;
    mount(ROOT_TAG, ResolverStackTestHost);
    await tick();
    const host = capturedResolverHost;
    if (!host) throw new Error('ResolverStackTestHost never mounted');
    expect(headerConfigOf(screenNodes()[0]).props.title).toBe('none');

    host.nav.setParams('second');
    await tick();
    expect(headerConfigOf(screenNodes()[0]).props.title).toBe('second');
  });

  it('setParams() targets a route by key when given, not just the focused one', async () => {
    capturedParamRoutes.length = 0;
    const handle = await mountParamsStack();
    // Home mounts first and captures its route, its `initialParams` are the feed tab
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
    expect(kidsOf(header)).toHaveLength(1);
    const subview = kidsOf(header)[0];
    expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
    expect(subview.props.type).toBe('searchBar');
    expect(subview.props.style).toContainEqual({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(kidsOf(subview)).toHaveLength(1);
    expect(kidsOf(subview)[0].viewName).toBe(SEARCH_BAR_VIEW);
    expect(kidsOf(subview)[0].props.placeholder).toBe('Search');
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

  describe('custom header views', () => {
    async function mountHeaderViews(
      build: (templates: IHeaderTemplates) => IAngularScreenOptions,
    ): Promise<IAuthoredNode[]> {
      buildHeaderOptions = build;
      mount(ROOT_TAG, HeaderViewsStackTestHost);
      await tick();
      return kidsOf(headerConfigOf(screenNodes()[0]));
    }

    const subviewOfType = (
      subviews: IAuthoredNode[],
      type: string,
    ): IAuthoredNode | undefined =>
      subviews.find(node => node.props.type === type);

    it.each([
      {
        option: 'headerLeft',
        type: 'left',
        testID: 'custom-left',
        build: (t: IHeaderTemplates) => ({ headerLeft: t.left }),
      },
      {
        option: 'headerRight',
        type: 'right',
        testID: 'custom-right',
        build: (t: IHeaderTemplates) => ({ headerRight: t.right }),
      },
      {
        option: 'headerTitle',
        type: 'center',
        testID: 'custom-title',
        build: (t: IHeaderTemplates) => ({ headerTitle: t.title }),
      },
    ])(
      'mounts the $option template inside a $type subview',
      async ({ type, testID, build }) => {
        const subview = subviewOfType(await mountHeaderViews(build), type);

        expect(subview?.viewName).toBe(HEADER_SUBVIEW_VIEW);
        expect(subview && kidsOf(subview)[0]?.props.testID).toBe(testID);
      },
    );

    it('sends the side priority and background options to the matching subview', async () => {
      const subviews = await mountHeaderViews(t => ({
        headerRight: t.right,
        headerRightVisibilityPriority: 'low',
        headerRightBackgroundVisible: false,
      }));

      const right = subviewOfType(subviews, 'right');
      expect(right?.props.visibilityPriority).toBe('low');
      expect(right?.props.hidesSharedBackground).toBe(true);
    });

    it('hosts the back image source in a back subview holding an image', async () => {
      const subviews = await mountHeaderViews(() => ({
        headerBackImageSource: { uri: 'https://example.test/b.png' },
      }));

      const back = subviewOfType(subviews, 'back');
      expect(back && kidsOf(back).map(child => child.viewName)).toEqual([
        'RCTImageView',
      ]);
    });

    it('keeps the search bar subview next to a custom one', async () => {
      const subviews = await mountHeaderViews(t => ({
        headerLeft: t.left,
        headerSearchBarOptions: { placeholder: 'Search' },
      }));

      expect(subviewOfType(subviews, 'left')).toBeDefined();
      expect(subviewOfType(subviews, 'searchBar')).toBeDefined();
    });

    it('adds no subview when the app sets no custom view', async () => {
      expect(await mountHeaderViews(() => ({ title: 'Home' }))).toEqual([]);
    });
  });

  describe('sheet footer', () => {
    async function mountSheet(
      build: (footer: TemplateRef<unknown>) => IAngularScreenOptions,
    ): Promise<void> {
      buildFooterOptions = build;
      mount(ROOT_TAG, SheetFooterStackTestHost);
      await tick();
    }

    const footerNode = () =>
      findInTree(node => node.viewName === SHEET_FOOTER_VIEW);
    const hasFooterChild = (viewName: string): boolean => {
      const parent = findInTree(node => node.viewName === viewName);
      return (
        parent !== undefined &&
        kidsOf(parent).some(kid => kid.viewName === SHEET_FOOTER_VIEW)
      );
    };

    it('mounts the footer template inside a native footer on a form sheet', async () => {
      await mountSheet(footer => ({
        stackPresentation: 'formSheet',
        sheetFooter: footer,
      }));

      const footer = footerNode();
      expect(footer && kidsOf(footer)[0]?.props.testID).toBe('custom-footer');
    });

    it('keeps the footer a real view, as native finds it by class', async () => {
      await mountSheet(footer => ({
        stackPresentation: 'formSheet',
        sheetFooter: footer,
      }));

      expect(footerNode()?.props.collapsable).toBe(false);
    });

    it('puts the footer in the inner screen that holds the header', async () => {
      await mountSheet(footer => ({
        stackPresentation: 'formSheet',
        sheetFooter: footer,
      }));

      expect(hasFooterChild(SCREEN_VIEW)).toBe(true);
    });

    it('puts the footer straight in the screen when the header is hidden', async () => {
      await mountSheet(footer => ({
        stackPresentation: 'formSheet',
        headerShown: false,
        sheetFooter: footer,
      }));

      expect(hasFooterChild(MODAL_SCREEN_VIEW)).toBe(true);
    });

    it.each(['push', 'modal', 'pageSheet'] as const)(
      'has no footer on a %s screen',
      async stackPresentation => {
        await mountSheet(footer => ({
          stackPresentation,
          sheetFooter: footer,
        }));

        expect(footerNode()).toBeUndefined();
      },
    );

    it('has no footer when the sheet sets none', async () => {
      await mountSheet(() => ({ stackPresentation: 'formSheet' }));

      expect(footerNode()).toBeUndefined();
    });
  });

  it('renders the header config with zero children when there is no search bar', async () => {
    await mountStack();
    const header = headerConfigOf(screenNodes()[0]);
    expect(kidsOf(header)).toHaveLength(0);
  });

  // A modal screen has no navigation controller on iOS, so the template nests the header and
  // content in an inner `RNSScreenStack` and `RNSScreen`. Only this case takes that branch
  it('a modal screen mounts as RNSModalScreen and nests its header inside an inner RNSScreenStack', async () => {
    mount(ROOT_TAG, ModalStackTestHost);
    await tick();

    const outer = findInTree(n => n.viewName === MODAL_SCREEN_VIEW);
    if (!outer) throw new Error('no RNSModalScreen mounted');

    const innerStack = kidsOf(outer).find(
      child => child.viewName === STACK_VIEW,
    );
    if (!innerStack)
      throw new Error('no inner RNSScreenStack nested inside the modal screen');
    const innerScreen = kidsOf(innerStack).find(
      child => child.viewName === SCREEN_VIEW,
    );
    if (!innerScreen)
      throw new Error('no inner RNSScreen nested inside the inner stack');
    // The only RNSScreen is the inner one, the outer mounted as RNSModalScreen
    // Compared by handle, as a recorded node is a fresh view object per lookup
    expect(screenNodes().map(node => node.handle)).toEqual([
      innerScreen.handle,
    ]);
    expect(headerConfigOf(innerScreen).props.title).toBe('Home');
  });

  // The template mounts an `RNSScreen` per route, so a marker that leaves the query while its
  // route is pushed would paint an empty screen the user cannot leave
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

  // The pruning must reach the state signal, else the next push rebuilds on the phantom and
  // back needs two presses
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

  // An app registers a table of screens with an `@for`, so the content query must see its markers
  it('registers the screens an @for block renders and pushes one of them', async () => {
    const handle = await mountForStack();
    expect(screenNodes()).toHaveLength(1);
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
    ).toBeDefined();

    handle.push('Details');
    await tick();

    expect(screenNodes()).toHaveLength(2);
    expect(
      findInTree(
        n => n.viewName === 'RCTRawText' && n.props.text === 'details',
      ),
    ).toBeDefined();
  });
});
