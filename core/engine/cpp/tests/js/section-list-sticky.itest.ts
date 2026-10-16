// Группа `sticky headers` из `SectionList-itest` в RN, порядок в смонтированном дереве

import { createElement } from 'react';

import { SectionList, mount } from '@symbiote-native/react';

import {
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  report,
  shapeOf,
} from './harness';

const ROOT_TAG = 1;

type IItem = { key: string };

describe('SectionList sticky section headers', () => {
  it('lays the items before the sticky header wrappers', () => {
    mount(
      ROOT_TAG,
      createElement(SectionList<IItem>, {
        stickySectionHeadersEnabled: true,
        sections: [
          { key: 's1', data: [{ key: 'i1' }] },
          { key: 's2', data: [{ key: 'i2' }] },
        ],
        renderItem: ({ item }) => createElement('text', {}, item.key),
        renderSectionHeader: ({ section }) =>
          createElement('text', {}, `Header: ${String(section.key)}`),
      }),
    );
    flushTimers();

    expect(shapeOf(mounted())).toBe(
      'RootView(ScrollView(View(Paragraph()Paragraph()View(Paragraph())View(Paragraph()))))',
    );
  });
});

report();
