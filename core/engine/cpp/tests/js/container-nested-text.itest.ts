// A text nested in a text commits as virtual text, which has no layout of its own
// It still answers to its container and keeps the nested-text rule when the hook rebuilds it
// Read from the committed shadow tree: the `color` of a virtual text is what its paragraph paints

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createRawText,
  createSurface,
  registerRules,
  routeProp,
  setNativeDebug,
  takeNativeDebugLog,
} from '@symbiote-native/engine';

import { deliverDirect } from '../../../src/events/delivery';
import { resetMediaEnvironment } from '../../../src/media-environment';
import {
  describe,
  expect,
  findCommitted,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const PLAIN_COLOR = '#ff0000';
const HELD_COLOR = '#0000ff';
const PLAIN_PAINT = 'rgba(255, 0, 0, 1)';
const HELD_PAINT = 'rgba(0, 0, 255, 1)';
const MOVED_PLAIN_COLOR = '#00ff00';
const MOVED_HELD_COLOR = '#00ffff';
const MOVED_HELD_PAINT = 'rgba(0, 255, 255, 1)';
// What `laidOutSize` logs when the container has no layout of its own
const NO_LAYOUT_LOG = 'container has no layout: ';
// What the commit hook logs after each pass, with the consumers it keeps for a later commit
const WAITING_LOG = 'consumers still waiting: ';
const WIDE = 500;
const NARROW = 300;

function registerCardRules() {
  // Clearing the rules drops the media environment, which only a restart brings back
  resetMediaEnvironment();
  clearGlobalStyles();
  registerRules(
    [
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: PLAIN_COLOR },
      },
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 1,
        style: { color: HELD_COLOR },
        cond: 0,
      },
      // Other colors, or the host sees the same variants and ships nothing on a class change
      {
        tokens: ['moved'],
        specificity: [0, 1, 0],
        order: 2,
        style: { color: MOVED_PLAIN_COLOR },
      },
      {
        tokens: ['moved'],
        specificity: [0, 1, 0],
        order: 3,
        style: { color: MOVED_HELD_COLOR },
        cond: 0,
      },
    ],
    [['@', null, ['>=', 'width', 400]]],
  );
}

function sizedContainer(width: number) {
  const container = createElement('RCTView', false);
  routeProp(container, 'style', {
    containerType: 'size',
    width,
    height: 80,
  });
  return container;
}

function cardText() {
  const text = createElement('RCTText', true);
  routeProp(text, 'class', 'card');
  appendChild(text, createRawText('text'));
  return text;
}

// What the device delivers to a container once it has a size, straight into the JS pipeline
function layOut(container: ReturnType<typeof sizedContainer>, width: number) {
  deliverDirect(container, 'layout', {
    layout: { x: 0, y: 0, width, height: 80 },
  });
}

function commitRoot(...containers: ReturnType<typeof sizedContainer>[]) {
  const root = createElement('RCTView', false);
  for (const container of containers) appendChild(root, container);
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
  return surface;
}

function mountConsumerText(isNested: boolean, containerWidth: number) {
  registerCardRules();
  const container = sizedContainer(containerWidth);
  const consumer = cardText();
  const outer = createElement('RCTText', true);
  if (isNested) {
    appendChild(outer, consumer);
    appendChild(container, outer);
  } else {
    appendChild(container, consumer);
  }
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(container);
  surface.commit();
  mounted();
}

// The native debug lines `run` emits, with the flag back off even when `run` throws
function nativeLogOf(run: () => void): readonly string[] {
  setNativeDebug(true);
  try {
    takeNativeDebugLog();
    run();
    return takeNativeDebugLog();
  } finally {
    setNativeDebug(false);
  }
}

// Fabric names a text under a text `Text`, and a lone one `Paragraph`
function virtualText() {
  return findCommitted(node => node.viewName === 'Text');
}

function paragraphPainting(paint: string) {
  return findCommitted(
    node =>
      node.viewName === 'Paragraph' && node.props.foregroundColor === paint,
  );
}

describe('a text that answers to a container', () => {
  it('is restyled when it sits directly in the container', () => {
    mountConsumerText(false, WIDE);

    expect(paragraphPainting(HELD_PAINT)?.props.ellipsizeMode).toBe('tail');
  });

  it('is restyled when nested under a text, and gets no outer text defaults', () => {
    mountConsumerText(true, WIDE);

    expect(virtualText()?.props.foregroundColor).toBe(HELD_PAINT);
    expect(virtualText()?.props.ellipsizeMode).toBe(undefined);
    expect(virtualText()?.props.allowFontScaling).toBe(undefined);
    expect(
      findCommitted(node => node.viewName === 'Paragraph')?.props.ellipsizeMode,
    ).toBe('tail');
  });

  it('keeps the plain style when nested in a container that is too narrow', () => {
    mountConsumerText(true, NARROW);

    expect(virtualText()?.props.foregroundColor).toBe(PLAIN_PAINT);
    expect(virtualText()?.props.ellipsizeMode).toBe(undefined);
  });

  it('is restyled by a wider container it moves to, with a new class', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const wide = sizedContainer(WIDE);
    const consumer = cardText();
    appendChild(narrow, consumer);
    const surface = commitRoot(narrow, wide);

    appendChild(wide, consumer);
    routeProp(consumer, 'class', 'moved');
    surface.commit();
    mounted();

    expect(paragraphPainting(MOVED_HELD_PAINT)?.props.ellipsizeMode).toBe(
      'tail',
    );
  });

  it('is restyled by a wider container created in the commit it moves in', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const consumer = cardText();
    appendChild(narrow, consumer);
    const root = createElement('RCTView', false);
    appendChild(root, narrow);
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(root);
    surface.commit();
    mounted();

    const fresh = sizedContainer(WIDE);
    appendChild(root, fresh);
    appendChild(fresh, consumer);
    routeProp(consumer, 'class', 'moved');
    surface.commit();
    mounted();

    expect(paragraphPainting(MOVED_HELD_PAINT)?.props.ellipsizeMode).toBe(
      'tail',
    );
  });

  it('is restyled by a wider container it moves to inside a text, with a new class', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const wide = sizedContainer(WIDE);
    const consumer = cardText();
    const outer = createElement('RCTText', true);
    appendChild(narrow, consumer);
    appendChild(wide, outer);
    const surface = commitRoot(narrow, wide);

    appendChild(outer, consumer);
    routeProp(consumer, 'class', 'moved');
    surface.commit();
    mounted();

    expect(virtualText()?.props.foregroundColor).toBe(MOVED_HELD_PAINT);
    expect(virtualText()?.props.allowFontScaling).toBe(undefined);
  });

  it('is restyled with the text defaults when it moves out of a text, with a new class', () => {
    registerCardRules();
    const from = sizedContainer(WIDE);
    const to = sizedContainer(WIDE);
    const consumer = cardText();
    const outer = createElement('RCTText', true);
    appendChild(outer, consumer);
    appendChild(from, outer);
    const surface = commitRoot(from, to);

    appendChild(to, consumer);
    routeProp(consumer, 'class', 'moved');
    surface.commit();
    mounted();

    expect(virtualText()).toBe(undefined);
    expect(paragraphPainting(MOVED_HELD_PAINT)?.props.ellipsizeMode).toBe(
      'tail',
    );
  });

  it('is restyled when its container is laid out wider after the first show', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const consumer = cardText();
    appendChild(narrow, consumer);
    const surface = commitRoot(narrow);
    expect(paragraphPainting(PLAIN_PAINT) !== undefined).toBe(true);

    layOut(narrow, WIDE);
    surface.commit();
    mounted();

    expect(paragraphPainting(HELD_PAINT)?.props.ellipsizeMode).toBe('tail');
  });

  // ВОПРОС: the tracker restyles after the commit's flush and nothing requests the next commit,
  // so a moved node keeps its old style until some other write commits. Intended?
  it('[характеризация - поведение не подтверждено] is restyled one commit after it moves to a wider container', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const wide = sizedContainer(WIDE);
    const consumer = cardText();
    appendChild(narrow, consumer);
    const surface = commitRoot(narrow, wide);
    layOut(narrow, NARROW);
    layOut(wide, WIDE);

    appendChild(wide, consumer);
    surface.commit();
    surface.commit();
    mounted();

    expect(paragraphPainting(HELD_PAINT)?.props.ellipsizeMode).toBe('tail');
  });

  it('[характеризация - поведение не подтверждено] is restyled one commit after it moves into a text under a wider container', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const wide = sizedContainer(WIDE);
    const consumer = cardText();
    const outer = createElement('RCTText', true);
    appendChild(narrow, consumer);
    appendChild(wide, outer);
    const surface = commitRoot(narrow, wide);
    layOut(narrow, NARROW);
    layOut(wide, WIDE);

    appendChild(outer, consumer);
    surface.commit();
    surface.commit();
    mounted();

    expect(virtualText()?.props.foregroundColor).toBe(HELD_PAINT);
    expect(virtualText()?.props.allowFontScaling).toBe(undefined);
  });

  it('keeps the plain style when nested under a container that leaves its width open', () => {
    registerCardRules();
    const open = createElement('RCTView', false);
    routeProp(open, 'style', { containerType: 'size', height: 80 });
    const consumer = cardText();
    const outer = createElement('RCTText', true);
    appendChild(outer, consumer);
    appendChild(open, outer);
    commitRoot(open);

    expect(virtualText()?.props.foregroundColor).toBe(PLAIN_PAINT);
    expect(virtualText()?.props.allowFontScaling).toBe(undefined);
  });

  it('is restyled when its container is laid out wider after a nested first show', () => {
    registerCardRules();
    const narrow = sizedContainer(NARROW);
    const consumer = cardText();
    const outer = createElement('RCTText', true);
    appendChild(outer, consumer);
    appendChild(narrow, outer);
    const surface = commitRoot(narrow);
    expect(virtualText()?.props.foregroundColor).toBe(PLAIN_PAINT);

    layOut(narrow, WIDE);
    surface.commit();
    mounted();

    expect(virtualText()?.props.foregroundColor).toBe(HELD_PAINT);
    expect(virtualText()?.props.allowFontScaling).toBe(undefined);
  });

  it('reports no missing container layout when the container is a view', () => {
    const lines = nativeLogOf(() => mountConsumerText(true, WIDE));

    expect(lines.some(line => line.includes(NO_LAYOUT_LOG))).toBe(false);
    expect(virtualText()?.props.foregroundColor).toBe(HELD_PAINT);
  });

  // ВОПРОС: a container that is itself a nested text has no layout, so the hook reads no size
  // and the consumer keeps its plain style. Intended?
  it('[характеризация - поведение не подтверждено] keeps the plain style under a container that is a nested text, and says why', () => {
    registerCardRules();
    const outer = createElement('RCTText', true);
    const containerText = createElement('RCTText', true);
    routeProp(containerText, 'style', {
      containerType: 'size',
      width: WIDE,
      height: 80,
    });
    const consumer = cardText();
    appendChild(containerText, consumer);
    appendChild(outer, containerText);
    const lines = nativeLogOf(() => commitRoot(outer));
    const waitingLines = lines.filter(line => line.includes(WAITING_LOG));

    expect(lines.some(line => line.includes(NO_LAYOUT_LOG))).toBe(true);
    expect(waitingLines[waitingLines.length - 1]?.endsWith(': 0')).toBe(true);
    expect(
      findCommitted(
        node =>
          node.viewName === 'Text' &&
          node.props.foregroundColor === PLAIN_PAINT,
      ) !== undefined,
    ).toBe(true);
  });
});

report();
