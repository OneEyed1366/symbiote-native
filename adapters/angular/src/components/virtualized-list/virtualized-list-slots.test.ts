// RN wraps the header, footer and empty templates with the list's counter-flip when inverted, and
// header and footer take their own style on that wrapper
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IViewStyle } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
} from './directives';

const ROOT_TAG = 978;
const VIEWPORT = { x: 0, y: 0, width: 320, height: 300 };
const OPACITY = 0.5;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const IMPORTS = [
  VirtualizedList,
  VListItemDirective,
  VListHeaderDirective,
  VListFooterDirective,
  VListEmptyDirective,
];

class ListHostBase {
  rows = [{ id: 1 }, { id: 2 }];
  getItem = (data: readonly { id: number }[], index: number) => data[index];
  getItemCount = (data: readonly unknown[]): number => data.length;
}

@Component({
  selector: 'symbiote-slots-inverted-host',
  standalone: true,
  imports: IMPORTS,
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [inverted]="true"
    >
      <ng-template vListItem><text>row</text></ng-template>
      <ng-template vListHeader><text>head</text></ng-template>
      <ng-template vListFooter><text>foot</text></ng-template>
    </VirtualizedList>
  `,
})
class InvertedHost extends ListHostBase {}

@Component({
  selector: 'symbiote-slots-empty-host',
  standalone: true,
  imports: IMPORTS,
  template: `
    <VirtualizedList
      [data]="[]"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [inverted]="true"
    >
      <ng-template vListItem><text>row</text></ng-template>
      <ng-template vListEmpty><text>nothing</text></ng-template>
    </VirtualizedList>
  `,
})
class EmptyHost extends ListHostBase {}

@Component({
  selector: 'symbiote-slots-upright-host',
  standalone: true,
  imports: IMPORTS,
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
    >
      <ng-template vListItem><text>row</text></ng-template>
      <ng-template vListHeader><text>head</text></ng-template>
    </VirtualizedList>
  `,
})
class UprightHost extends ListHostBase {}

@Component({
  selector: 'symbiote-slots-styled-host',
  standalone: true,
  imports: IMPORTS,
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [listHeaderComponentStyle]="slotStyle"
      [listFooterComponentStyle]="slotStyle"
    >
      <ng-template vListItem><text>row</text></ng-template>
      <ng-template vListHeader><text>head</text></ng-template>
      <ng-template vListFooter><text>foot</text></ng-template>
    </VirtualizedList>
  `,
})
class StyledHost extends ListHostBase {
  slotStyle: IViewStyle = { opacity: OPACITY };
}

async function open(host: Parameters<typeof mount>[1]): Promise<void> {
  mount(ROOT_TAG, host);
  await tick();
  const scroll = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
  if (scroll === undefined) throw new Error('no scroll view was committed');
  fabric.fireEvent(scroll.instanceHandle, 'topLayout', { layout: VIEWPORT });
  await tick();
  await tick();
}

function wrapperOf(label: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child =>
      child.children.some(c => c.payload.text === label),
    ),
  );
  if (found === undefined) throw new Error(`no wrapper holds ${label}`);
  return found;
}

function flipsOf(node: ILiveNode): boolean {
  return JSON.stringify(node.payload).includes('-1');
}

describe('Angular list header, footer and empty templates', () => {
  it('counter-flips header and footer of an inverted list', async () => {
    await open(InvertedHost);

    expect(flipsOf(wrapperOf('head'))).toBe(true);
    expect(flipsOf(wrapperOf('foot'))).toBe(true);
  });

  it('counter-flips the empty template of an inverted list', async () => {
    await open(EmptyHost);

    expect(flipsOf(wrapperOf('nothing'))).toBe(true);
  });

  it('leaves the templates upright when the list is not inverted', async () => {
    await open(UprightHost);

    expect(flipsOf(wrapperOf('head'))).toBe(false);
  });

  it('applies listHeaderComponentStyle and listFooterComponentStyle', async () => {
    await open(StyledHost);

    expect(wrapperOf('head').payload.opacity).toBe(OPACITY);
    expect(wrapperOf('foot').payload.opacity).toBe(OPACITY);
  });
});
