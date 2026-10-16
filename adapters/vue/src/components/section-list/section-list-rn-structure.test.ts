// The Vue twin of the React `section-list-rn-structure` test: the committed text stream in
// document order, after RN's `SectionList-itest.js` and `VirtualizedSectionList.js` separators
import {
  defineComponent,
  h,
  type FunctionalComponent,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SectionList, mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const SectionListHost = SectionList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 341;
const VIEWPORT = { x: 0, y: 0, width: 320, height: 2_000 };

type IItem = { key: string };
type ISeparators = { highlight(): void; unhighlight(): void };
type IRender = VNode[] | VNode;
type ISect = {
  title: string;
  key: string;
  data: IItem[];
  renderItem?: (info: { item: IItem }) => IRender;
  ItemSeparatorComponent?: () => IRender;
};

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const text = (value: string): VNode => h('text', {}, value);

const section = (
  key: string,
  keys: string[],
  extra: Partial<ISect> = {},
): ISect => ({
  title: key,
  key,
  data: keys.map(row => ({ key: row })),
  ...extra,
});

const keyOf = (value: unknown): string => (isKeyed(value) ? value.key : 'null');

const isKeyed = (value: unknown): value is { key: string } =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string';

async function show(
  props: Record<string, unknown>,
  slots: Record<string, (info: never) => IRender> = {},
): Promise<string[]> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(SectionListHost, props, {
          item: ({ item }: { item: IItem }) => text(item.key),
          ...slots,
        }),
    }),
  );
  await tick();
  const scrollView = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
  const handle = scrollView?.instanceHandle;
  if (typeof handle === 'object' && handle !== null) {
    fabric.fireEvent(handle, 'topLayout', { layout: VIEWPORT });
  }
  await tick();
  return live.texts(live.appRoot());
}

const describeSeparator = (props: Record<string, unknown>): VNode =>
  text(
    `leading=${keyOf(props.leadingItem)},trailing=${keyOf(props.trailingItem)},section=${keyOf(props.section)},highlighted=${String(props.highlighted)},leadingSection=${keyOf(props.leadingSection)},trailingSection=${keyOf(props.trailingSection)}`,
  );

describe('Vue SectionList renders its sections like RN', () => {
  it('lets a section renderItem override the list slot', async () => {
    const custom = section('s1', ['i1s1', 'i2s1'], {
      renderItem: ({ item }) => text(`custom:${item.key}`),
    });

    const texts = await show(
      { sections: [custom, section('s2', ['i1s2'])] },
      { item: ({ item }: { item: IItem }) => text(`default:${item.key}`) },
    );

    expect(texts).toEqual(['custom:i1s1', 'custom:i2s1', 'default:i1s2']);
  });

  it('puts the item separator between items only', async () => {
    const texts = await show(
      { sections: [section('s1', ['i1', 'i2', 'i3'])] },
      { separator: () => text('separator') },
    );

    expect(texts).toEqual(['i1', 'separator', 'i2', 'separator', 'i3']);
  });

  it('gives the item separator its neighbours and section', async () => {
    const texts = await show(
      { sections: [section('s1', ['i1', 'i2'])] },
      { separator: describeSeparator },
    );

    expect(texts).toEqual([
      'i1',
      'leading=i1,trailing=i2,section=s1,highlighted=false,leadingSection=null,trailingSection=null',
      'i2',
    ]);
  });

  it('prefers a section separator over the list-wide one', async () => {
    const first = section('s1', ['i1', 'i2'], {
      ItemSeparatorComponent: () => text('s1-sep'),
    });

    const texts = await show(
      { sections: [first, section('s2', ['i3', 'i4'])] },
      { separator: () => text('default-sep') },
    );

    expect(texts).toEqual(['i1', 's1-sep', 'i2', 'i3', 'default-sep', 'i4']);
  });

  it('renders the section separator before and after each section', async () => {
    const texts = await show(
      { sections: [section('s1', ['i1']), section('s2', ['i2'])] },
      { sectionSeparator: () => text('section-sep') },
    );

    expect(texts).toEqual([
      'section-sep',
      'i1',
      'section-sep',
      'section-sep',
      'i2',
      'section-sep',
    ]);
  });

  it('gives the section separator its items and neighbouring sections', async () => {
    const texts = await show(
      {
        sections: [
          section('s1', ['i1']),
          section('s2', ['i2']),
          section('s3', ['i3']),
        ],
      },
      { sectionSeparator: describeSeparator },
    );

    expect(texts.slice(3, 6)).toEqual([
      'leading=null,trailing=i2,section=s2,highlighted=false,leadingSection=s1,trailingSection=s3',
      'i2',
      'leading=i2,trailing=null,section=s2,highlighted=false,leadingSection=s1,trailingSection=s3',
    ]);
  });

  it('renders the whole stream in RN order', async () => {
    const first = section('s1', ['i1s1', 'i2s1'], {
      renderItem: ({ item }) => text(`s1-item:${item.key}`),
      ItemSeparatorComponent: () => text('s1-item-sep'),
    });

    const texts = await show(
      {
        initialNumToRender: Infinity,
        sections: [first, section('s2', ['i1s2', 'i2s2'])],
      },
      {
        item: ({ item }: { item: IItem }) => text(`default-item:${item.key}`),
        sectionHeader: ({ section: of }: { section: ISect }) =>
          text(`section-header:${of.key}`),
        sectionFooter: ({ section: of }: { section: ISect }) =>
          text(`section-footer:${of.key}`),
        separator: () => text('item-sep'),
        sectionSeparator: () => text('section-sep'),
        header: () => text('list-header'),
        footer: () => text('list-footer'),
      },
    );

    expect(texts).toEqual([
      'list-header',
      'section-header:s1',
      'section-sep',
      's1-item:i1s1',
      's1-item-sep',
      's1-item:i2s1',
      'section-sep',
      'section-footer:s1',
      'section-header:s2',
      'section-sep',
      'default-item:i1s2',
      'item-sep',
      'default-item:i2s2',
      'section-sep',
      'section-footer:s2',
      'list-footer',
    ]);
  });
});

describe('Vue SectionList separator state across cells', () => {
  it('lights the separators around a cell on highlight', async () => {
    const handles: Record<string, ISeparators> = {};

    const texts = await show(
      { sections: [section('s1', ['i1', 'i2', 'i3'])] },
      {
        item: ({
          item,
          separators,
        }: {
          item: IItem;
          separators: ISeparators;
        }) => {
          handles[item.key] = separators;
          return text(item.key);
        },
        separator: (props: Record<string, unknown>) =>
          text(`sep:${String(props.highlighted)}`),
      },
    );
    expect(texts).toEqual(['i1', 'sep:false', 'i2', 'sep:false', 'i3']);

    handles.i2.highlight();
    await tick();

    expect(live.texts(live.appRoot())).toEqual([
      'i1',
      'sep:true',
      'i2',
      'sep:true',
      'i3',
    ]);
  });
});
