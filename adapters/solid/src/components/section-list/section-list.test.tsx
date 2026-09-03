// Solid twin of adapters/react's section-list test (and adapters/vue's, adapters/svelte's).
// SectionList is the public preset over VirtualizedSectionList, mirroring RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList layering, so the flattening, windowing
// and imperative-scroll behaviour are proven next door in ../virtualized-section-list. What is
// proven HERE is only what the preset itself can break: that the whole surface — the section
// stream, the imperative handle, and the passthrough props — reaches the layer underneath.
//
// No Negative group: SectionList declares no input of its own and has no throwing path. A row that
// renders a bare string still throws, but that is VirtualizedSectionList's behaviour and is tested
// there.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import { mount, unmount } from '../../render';
import { SectionList, type ISectionListHandle } from './index';

const ROOT_TAG = 823;
const SCROLL_VIEW = 'RCTScrollView';
const VIEWPORT_HEIGHT = 400;
const CELL_HEIGHT = 50;
const CONTENT_VIEW = 'RCTScrollContentView';

interface IRow {
  id: number;
  label: string;
}

const SECTIONS = [
  {
    title: 'Section A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'Section B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function flatCommitted(): IFakeNode[] {
  const flat: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return flat;
}

function committed(viewName: string): IFakeNode {
  const found = flatCommitted().find(node => node.viewName === viewName);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

function committedTexts(): string[] {
  const texts: string[] = [];
  for (const node of flatCommitted()) {
    const text: unknown = node.props.text;
    if (typeof text === 'string') texts.push(text);
  }
  return texts;
}

async function settleViewport(): Promise<void> {
  await tick();
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
}

describe('Solid SectionList on the engine', () => {
  describe('Positive', () => {
    // why: SectionList is the name RN apps actually import, and it must paint the same flattened
    // stream as the layer under it — section header, that section's items, then its footer. A
    // preset that dropped or reordered a render prop on the way down would show a plausible-looking
    // but wrong screen with no runtime error.
    it('renders the same flattened section stream as the layer under it', async () => {
      mount(ROOT_TAG, () => (
        <SectionList<IRow>
          sections={SECTIONS}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={info => (
            <symbiote-text>{`footer:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'row-a0',
        'row-a1',
        'footer:Section A',
        'header:Section B',
        'row-b0',
        'row-b1',
        'footer:Section B',
      ]);
    });

    // why: the ref is what an app drives the list with — "jump to today's section" from a tab press
    // or a deep link — and RN exposes the SAME handle on SectionList as on VirtualizedSectionList.
    // A preset that consumes the ref instead of threading it through hands the app a dead object,
    // and the failure is silent: every call becomes a no-op.
    it('threads the imperative handle through to the inner list', async () => {
      let list: ISectionListHandle | undefined;
      mount(ROOT_TAG, () => (
        <SectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      // y advances down the children the way a real host reports it — the offset table reads the
      // distance between two measured neighbours, so cells all claiming y=0 would stack (buildOffsets).
      let cellY = 0;
      for (const child of committed(CONTENT_VIEW).children) {
        fabric.fireEvent(child.instanceHandle, 'topLayout', {
          layout: { x: 0, y: cellY, width: 320, height: CELL_HEIGHT },
        });
        cellY += CELL_HEIGHT;
      }
      await tick();

      // Header B is the fifth row of the flattened stream, so 4 * 50pt.
      list?.scrollToLocation({
        sectionIndex: 1,
        itemIndex: 0,
        animated: false,
      });

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, 200, false]);
    });

    // why: everything SectionList does not own has to arrive at the layer below unchanged — the
    // sticky-header default (RN sticks them on iOS unless told otherwise), the styling, the
    // accessibility surface. A preset that forwards only the props it happens to name would silently
    // shrink the component's surface, which is exactly the P0 parity failure this layer risks.
    it('forwards the sticky default and the scroll-host surface untouched', async () => {
      mount(ROOT_TAG, () => (
        <SectionList<IRow>
          sections={SECTIONS}
          testID="the-section-list"
          style={{ backgroundColor: 'red' }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const wrappers = flatCommitted().filter(
        node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'one sticky wrapper per section header').toHaveLength(2);

      const scroll = committed(SCROLL_VIEW).props;
      expect(scroll.testID).toBe('the-section-list');
      expect(scroll.backgroundColor).toBe('red');
    });
  });
});
