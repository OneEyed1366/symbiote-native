/** @jsxRuntime automatic */
// Headless proof that VirtualizedSectionList routes its section-header positions to the
// ScrollView's native stickyHeaderIndices. A fake slot records every created node; we
// mount two small sections (all entries inside the initial window) and assert the
// RCTScrollView carries stickyHeaderIndices for the two header child positions — and
// that stickySectionHeadersEnabled={false} drops the prop. No simulator; the visual
// stick is native, but the index plumbing is JS and proven here.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { VirtualizedSectionList } from '../../packages/react/src/virtualized-section-list'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

const allCreated: FakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

interface Row {
  id: number
}

const SECTIONS = [
  { title: 'A', data: [{ id: 0 }, { id: 1 }] },
  { title: 'B', data: [{ id: 2 }, { id: 3 }] },
]

function reset(): void {
  allCreated.length = 0
}

// The outer scroll view is the one carrying the sticky-header prop.
function scrollView(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'RCTScrollView')
  if (!node) throw new Error('no RCTScrollView was created')
  return node
}

function renderSection(props: {
  sections: typeof SECTIONS
  stickySectionHeadersEnabled?: boolean
}): ReactElement {
  return createElement(VirtualizedSectionList<Row>, {
    sections: props.sections,
    stickySectionHeadersEnabled: props.stickySectionHeadersEnabled,
    renderSectionHeader: ({ section }) => createElement('symbiote-text', {}, section.title),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  })
}

// ---- case 1: headers in the window forward as stickyHeaderIndices ----------
// Flattened: [0]=header A, [1..2]=items, [3]=footer A, [4]=header B, [5..6]=items,
// [7]=footer B. No separators, no list header -> child positions equal entry indices,
// so the two headers land at child 0 and 4.

{
  reset()
  mount(51, renderSection({ sections: SECTIONS }))
  const indices = scrollView().props.stickyHeaderIndices
  if (!Array.isArray(indices)) {
    throw new Error(`expected stickyHeaderIndices array, got ${JSON.stringify(indices)}`)
  }
  if (indices.length !== 2 || indices[0] !== 0 || indices[1] !== 4) {
    throw new Error(`stickyHeaderIndices should be [0, 4], got ${JSON.stringify(indices)}`)
  }
}

// ---- case 2: stickySectionHeadersEnabled={false} drops the prop -------------

{
  reset()
  mount(52, renderSection({ sections: SECTIONS, stickySectionHeadersEnabled: false }))
  const indices = scrollView().props.stickyHeaderIndices
  if (indices !== undefined) {
    throw new Error(`disabled sticky headers must not set stickyHeaderIndices, got ${JSON.stringify(indices)}`)
  }
}

console.log('sticky-section-headers.smoke OK')
