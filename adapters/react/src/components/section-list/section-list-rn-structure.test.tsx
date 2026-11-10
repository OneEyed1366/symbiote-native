/** @jsxRuntime automatic */
// RN's `SectionList-itest.js` rendered-structure cases, read as the committed text stream in
// document order. Fantom's keys and zIndex ordering are not reproduced, the stream is
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SectionList,
  mount,
  unmount,
  type ISection,
  type ISectionListProps,
  type ISeparators,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 61;
const VIEWPORT = { x: 0, y: 0, width: 320, height: 2_000 };

type IItem = { key: string };
type ISect = ISection<IItem>;
type IListProps = Partial<ISectionListProps<IItem>> &
  Pick<ISectionListProps<IItem>, 'sections'>;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const text = (value: string): ReactElement => createElement('text', {}, value);

const item = (key: string): IItem => ({ key });

const section = (
  key: string,
  keys: string[],
  extra: Partial<ISect> = {},
): ISect => ({ title: key, key, data: keys.map(item), ...extra });

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function show(element: ReactElement): string[] {
  mount(ROOT_TAG, element);
  const scrollView = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
  // Без скролла пустой результат не отличить от упавшего рендера
  if (scrollView === undefined)
    throw new Error('the list mounted no scroll view');
  const handle = scrollView.instanceHandle;
  if (typeof handle === 'object' && handle !== null) {
    fabric.fireEvent(handle, 'topLayout', { layout: VIEWPORT });
  }
  return live.texts(live.appRoot());
}

function list(props: IListProps): ReactElement {
  return createElement(SectionList<IItem>, {
    renderItem: ({ item: row }) => text(row.key),
    ...props,
  });
}

const keyOf = (value: unknown): string => (isKeyed(value) ? value.key : 'null');

const isKeyed = (value: unknown): value is { key: string } =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string';

const headerOf = ({ section: of }: { section: ISect }): ReactElement =>
  text(`Header: ${of.key}`);
const footerOf = ({ section: of }: { section: ISect }): ReactElement =>
  text(`Footer: ${of.key}`);

describe('SectionList renders its sections like RN', () => {
  it('renders nothing for an empty list', () => {
    expect(show(list({ sections: [] }))).toEqual([]);
  });

  it('renders items when renderSectionHeader returns null', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2'])],
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual(['i1', 'i2']);
  });

  it('passes item, index and section to renderItem', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2'])],
        renderItem: ({ item: row, index, section: of }) =>
          text(`item:${row.key},index:${index},section:${of.key}`),
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual([
      'item:i1,index:0,section:s1',
      'item:i2,index:1,section:s1',
    ]);
  });

  it('renders the section header above its items', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2'])],
        renderSectionHeader: headerOf,
      }),
    );

    expect(texts).toEqual(['Header: s1', 'i1', 'i2']);
  });

  it('renders the section footer for an empty section, with or without a header', () => {
    const sections = [section('s1', [])];

    expect(
      show(
        list({
          sections,
          renderSectionHeader: headerOf,
          renderSectionFooter: footerOf,
        }),
      ),
    ).toEqual(['Header: s1', 'Footer: s1']);

    unmount(ROOT_TAG);
    fabric.reset();
    expect(show(list({ sections, renderSectionFooter: footerOf }))).toEqual([
      'Footer: s1',
    ]);
  });

  it('renders the section footer after its items', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2'])],
        renderSectionHeader: () => null,
        renderSectionFooter: footerOf,
      }),
    );

    expect(texts).toEqual(['i1', 'i2', 'Footer: s1']);
  });

  it('renders every section in order', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1']), section('s2', ['i2'])],
        renderSectionHeader: headerOf,
      }),
    );

    expect(texts).toEqual(['Header: s1', 'i1', 'Header: s2', 'i2']);
  });

  it('wraps the list header and footer around the items', () => {
    const texts = show(
      list({
        initialNumToRender: Infinity,
        ListHeaderComponent: () => text('List Header'),
        ListFooterComponent: () => text('List Footer'),
        sections: [section('s1', ['i1'])],
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual(['List Header', 'i1', 'List Footer']);
  });

  it('renders the empty component for an empty sections array', () => {
    const texts = show(
      list({ sections: [], ListEmptyComponent: () => text('empty list') }),
    );

    expect(texts).toEqual(['empty list']);
  });

  it('lets a section renderItem override the list one', () => {
    const custom = section('s1', ['i1s1', 'i2s1'], {
      renderItem: ({ item: row }) => text(`custom:${row.key}`),
    });
    const texts = show(
      list({
        sections: [custom, section('s2', ['i1s2'])],
        renderItem: ({ item: row }) => text(`default:${row.key}`),
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual(['custom:i1s1', 'custom:i2s1', 'default:i1s2']);
  });
});

describe('SectionList separators', () => {
  const describeSeparator = (props: {
    leadingItem?: IItem;
    trailingItem?: IItem;
    section?: unknown;
    leadingSection?: unknown;
    trailingSection?: unknown;
    highlighted: boolean;
  }): ReactElement =>
    text(
      `leading=${keyOf(props.leadingItem)},trailing=${keyOf(props.trailingItem)},section=${keyOf(props.section)},highlighted=${String(props.highlighted)},leadingSection=${keyOf(props.leadingSection)},trailingSection=${keyOf(props.trailingSection)}`,
    );

  it('puts the item separator between items only', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2', 'i3'])],
        ItemSeparatorComponent: () => text('separator'),
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual(['i1', 'separator', 'i2', 'separator', 'i3']);
  });

  it('gives the item separator its neighbours and section', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2', 'i3'])],
        ItemSeparatorComponent: describeSeparator,
        renderSectionHeader: () => null,
      }),
    );

    const none = 'leadingSection=null,trailingSection=null';
    expect(texts).toEqual([
      'i1',
      `leading=i1,trailing=i2,section=s1,highlighted=false,${none}`,
      'i2',
      `leading=i2,trailing=i3,section=s1,highlighted=false,${none}`,
      'i3',
    ]);
  });

  it('prefers a section separator over the list-wide one', () => {
    const first = section('s1', ['i1', 'i2'], {
      ItemSeparatorComponent: () => text('s1-sep'),
    });
    const texts = show(
      list({
        sections: [first, section('s2', ['i3', 'i4'])],
        ItemSeparatorComponent: () => text('default-sep'),
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual(['i1', 's1-sep', 'i2', 'i3', 'default-sep', 'i4']);
  });

  it('renders the section separator before and after each section', () => {
    const texts = show(
      list({
        sections: [section('s1', ['i1']), section('s2', ['i2'])],
        SectionSeparatorComponent: () => text('section-sep'),
        renderSectionHeader: () => null,
      }),
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

  it('gives the section separator its items and neighbouring sections', () => {
    const texts = show(
      list({
        sections: [
          section('s1', ['i1']),
          section('s2', ['i2']),
          section('s3', ['i3']),
        ],
        SectionSeparatorComponent: describeSeparator,
        renderSectionHeader: () => null,
      }),
    );

    expect(texts).toEqual([
      'leading=null,trailing=i1,section=s1,highlighted=false,leadingSection=null,trailingSection=s2',
      'i1',
      'leading=i1,trailing=null,section=s1,highlighted=false,leadingSection=null,trailingSection=s2',
      'leading=null,trailing=i2,section=s2,highlighted=false,leadingSection=s1,trailingSection=s3',
      'i2',
      'leading=i2,trailing=null,section=s2,highlighted=false,leadingSection=s1,trailingSection=s3',
      'leading=null,trailing=i3,section=s3,highlighted=false,leadingSection=s2,trailingSection=null',
      'i3',
      'leading=i3,trailing=null,section=s3,highlighted=false,leadingSection=s2,trailingSection=null',
    ]);
  });
});

describe('SectionList separator state across cells', () => {
  it('lights the item separator after a cell and the one before it on highlight', async () => {
    const handles: Record<string, ISeparators> = {};
    const texts = show(
      list({
        sections: [section('s1', ['i1', 'i2', 'i3'])],
        ItemSeparatorComponent: ({ highlighted }) =>
          text(`sep:${String(highlighted)}`),
        renderItem: ({ item: row, separators }) => {
          handles[row.key] = separators;
          return text(row.key);
        },
        renderSectionHeader: () => null,
      }),
    );
    expect(texts).toEqual(['i1', 'sep:false', 'i2', 'sep:false', 'i3']);

    handles.i2.highlight();
    await flush();

    expect(live.texts(live.appRoot())).toEqual([
      'i1',
      'sep:true',
      'i2',
      'sep:true',
      'i3',
    ]);

    handles.i2.unhighlight();
    await flush();

    expect(live.texts(live.appRoot())).toEqual([
      'i1',
      'sep:false',
      'i2',
      'sep:false',
      'i3',
    ]);
  });

  it('routes updateProps to the trailing separator of the cell', async () => {
    const handles: Record<string, ISeparators> = {};
    show(
      list({
        sections: [section('s1', ['i1', 'i2'])],
        ItemSeparatorComponent: ({ trailingItem }) =>
          text(`sep:${keyOf(trailingItem)}`),
        renderItem: ({ item: row, separators }) => {
          handles[row.key] = separators;
          return text(row.key);
        },
        renderSectionHeader: () => null,
      }),
    );

    handles.i1.updateProps('trailing', { trailingItem: item('patched') });
    await flush();

    expect(live.texts(live.appRoot())).toEqual(['i1', 'sep:patched', 'i2']);
  });
});

describe('SectionList with every feature at once', () => {
  it('renders the whole stream in RN order', () => {
    const first = section('s1', ['i1s1', 'i2s1'], {
      renderItem: ({ item: row }) => text(`s1-item:${row.key}`),
      ItemSeparatorComponent: () => text('s1-item-sep'),
    });
    const texts = show(
      list({
        initialNumToRender: Infinity,
        ListHeaderComponent: () => text('list-header'),
        ListFooterComponent: () => text('list-footer'),
        ItemSeparatorComponent: () => text('item-sep'),
        SectionSeparatorComponent: () => text('section-sep'),
        sections: [
          first,
          section('s2', ['i1s2', 'i2s2']),
          section('s3', ['i1s3', 'i2s3']),
        ],
        renderItem: ({ item: row }) => text(`default-item:${row.key}`),
        renderSectionHeader: ({ section: of }) =>
          text(`section-header:${of.key}`),
        renderSectionFooter: ({ section: of }) =>
          text(`section-footer:${of.key}`),
      }),
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
      'section-header:s3',
      'section-sep',
      'default-item:i1s3',
      'item-sep',
      'default-item:i2s3',
      'section-sep',
      'section-footer:s3',
      'list-footer',
    ]);
  });
});
