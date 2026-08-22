// Co-located unit test (ADR 0025) for the three IAnyNavigatorHandle type guards -
// useNavigation()/injectNavigation() return the union because they don't know which navigator
// mounted the caller, and app code should never have to write this narrowing itself. No Negative
// group: each guard is a total boolean predicate over the union, never throws - only the
// contract-accurate label used, "identifies X and rules out the others".
import { describe, expect, it } from 'vitest';
import {
  isDrawerNavigatorHandle,
  isStackNavigatorHandle,
  isTabNavigatorHandle,
} from './index';
import type {
  IDrawerNavigatorHandle,
  INavigatorHandle,
  ITabNavigatorHandle,
} from './index';

const stackHandle: INavigatorHandle = {
  push: () => {},
  pop: () => {},
  popToTop: () => {},
  popTo: () => {},
  replace: () => {},
  setParams: () => {},
  reset: () => {},
  canGoBack: () => false,
};

const tabHandle: ITabNavigatorHandle = {
  jumpTo: () => {},
  setParams: () => {},
};

const drawerHandle: IDrawerNavigatorHandle = {
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  jumpTo: () => {},
};

describe('navigator handle guards', () => {
  // why: a hook that reads `push` off the union must be the ONE narrowing the app is allowed to
  // rely on - a false positive on a Tab/Drawer handle would let a caller invoke a method that
  // doesn't exist on it at runtime.
  it('identifies a Stack handle by push and rules out Tab/Drawer', () => {
    expect(isStackNavigatorHandle(stackHandle)).toBe(true);
    expect(isTabNavigatorHandle(stackHandle)).toBe(false);
    expect(isDrawerNavigatorHandle(stackHandle)).toBe(false);
  });

  // why: Drawer handles ALSO carry jumpTo (see the Drawer case below), so a naive
  // "has jumpTo" check alone would misclassify a Drawer handle as Tab - isTabNavigatorHandle
  // must additionally rule out Drawer, proven together with the next test.
  it('identifies a Tab handle by jumpTo without openDrawer', () => {
    expect(isTabNavigatorHandle(tabHandle)).toBe(true);
    expect(isStackNavigatorHandle(tabHandle)).toBe(false);
    expect(isDrawerNavigatorHandle(tabHandle)).toBe(false);
  });

  it('identifies a Drawer handle by openDrawer, even though it also has jumpTo', () => {
    expect(isDrawerNavigatorHandle(drawerHandle)).toBe(true);
    expect(isTabNavigatorHandle(drawerHandle)).toBe(false);
    expect(isStackNavigatorHandle(drawerHandle)).toBe(false);
  });
});
