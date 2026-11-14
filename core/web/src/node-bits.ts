// What the C++ rules read off a node besides its own props, handed to the web rules as extra keys
// of its bag: the bit of an owned press listener, and what a part asks of the control it sits in

import type { IDomNode } from './dom-node';
import { DEFAULT_ACTIVE_OPACITY } from './highlight-rules';
import { disabledOf } from './pressable-rules';
import {
  BUTTON_LABEL_TAG,
  BUTTON_TAG,
  CHECKBOX_MARK_TAG,
  CHECKBOX_TAG,
  HIGHLIGHT_TAG,
} from './view-tags';

// A part reads its control, and has to be restyled when the control changes
type IOwnership = {
  owner: string;
  part: string;
  key: string;
  bitsOf: (
    ownerProps: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>;
};

const OWNERSHIPS: readonly IOwnership[] = [
  {
    owner: BUTTON_TAG,
    part: BUTTON_LABEL_TAG,
    key: 'buttonOwner',
    bitsOf: props => ({ color: props.color, isDisabled: disabledOf(props) }),
  },
  {
    owner: CHECKBOX_TAG,
    part: CHECKBOX_MARK_TAG,
    key: 'checkboxOwner',
    bitsOf: props => ({ isChecked: props.value === true }),
  },
];

// RN's `_hasPressHandler`: any of these makes the underlay worth showing
const PRESS_LISTENERS = ['press', 'pressIn', 'pressOut', 'longPress'] as const;

type IPressListener = (typeof PRESS_LISTENERS)[number];

// `testOnly_pressed` shows the underlay with no gesture and without the press-handler check
function isUnderlayShown(highlight: IDomNode): boolean {
  const hasPress = PRESS_LISTENERS.some(
    (name: IPressListener) => highlight.ownedListeners[name] === true,
  );
  return (
    highlight.props.testOnly_pressed === true ||
    (highlight.underlayShown && hasPress)
  );
}

// The box reads its own state, its single child reads the box
function highlightBitsOf(node: IDomNode): Record<string, unknown> {
  const bits: Record<string, unknown> = {};
  const { parent } = node;
  if (node.tagName === HIGHLIGHT_TAG) {
    const { underlayColor } = node.props;
    bits.underlay = {
      isActive: isUnderlayShown(node),
      hasColor: underlayColor !== undefined,
      color: underlayColor,
    };
  }
  if (parent?.tagName === HIGHLIGHT_TAG && isUnderlayShown(parent)) {
    const { activeOpacity } = parent.props;
    bits.highlightChild = {
      opacity:
        typeof activeOpacity === 'number'
          ? activeOpacity
          : DEFAULT_ACTIVE_OPACITY,
    };
  }
  return bits;
}

// A view may sit between the control and its part, so the nearest one is asked for
function ownerAbove(node: IDomNode, ownerTag: string): IDomNode | undefined {
  for (let up = node.parent; up !== undefined; up = up.parent) {
    if (up.tagName === ownerTag) return up;
  }
  return undefined;
}

export function derivedBitsOf(node: IDomNode): Record<string, unknown> {
  const bits: Record<string, unknown> = highlightBitsOf(node);
  if (node.ownedListeners.press === true) bits.hasPressListener = true;
  for (const { owner, part, key, bitsOf } of OWNERSHIPS) {
    const control = node.tagName === part ? ownerAbove(node, owner) : undefined;
    if (control !== undefined) bits[key] = bitsOf(control.props);
  }
  return bits;
}

function addPartsBelow(
  node: IDomNode,
  partTag: string,
  dirty: Set<IDomNode>,
): void {
  for (const child of node.children) {
    if (child.tagName === partTag) dirty.add(child);
    addPartsBelow(child, partTag, dirty);
  }
}

// A control that changed restyles its parts, which the parts themselves never hear of
export function addDependents(dirty: Set<IDomNode>): void {
  for (const node of dirty) {
    for (const { owner, part } of OWNERSHIPS) {
      if (node.tagName === owner) addPartsBelow(node, part, dirty);
    }
    if (node.tagName === HIGHLIGHT_TAG)
      node.children.forEach(child => dirty.add(child));
  }
}
