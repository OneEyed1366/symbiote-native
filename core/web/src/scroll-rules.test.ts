// Прокрутка в странице: оси, скрытые полосы и запрет жеста выбирают классы и inline css

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';
import { CLASS_NAMES, RESET_CSS } from './reset-sheet';
import { scrollRules } from './scroll-rules';

const SCROLL = 'scroll-view';
const HORIZONTAL_SCROLL = 'horizontal-scroll-view';
const CONTENT = 'scroll-content';
const HORIZONTAL_CONTENT = 'horizontal-scroll-content';

describe('scroll rules', () => {
  it('scrolls a vertical scroller along y only', () => {
    expect(scrollRules(SCROLL, {})).toEqual({
      classNames: [CLASS_NAMES.scrollY],
      css: {},
    });
  });

  it('scrolls a horizontal scroller along x only', () => {
    expect(scrollRules(HORIZONTAL_SCROLL, {}).classNames).toEqual([
      CLASS_NAMES.scrollX,
    ]);
  });

  it('lays out the content of a horizontal scroller in a row', () => {
    expect(scrollRules(HORIZONTAL_CONTENT, {}).classNames).toEqual([
      CLASS_NAMES.scrollContentX,
    ]);
    expect(scrollRules(CONTENT, {}).classNames).toEqual([]);
  });

  it('stops scrolling when the scroller is disabled', () => {
    expect(scrollRules(SCROLL, { scrollEnabled: false }).css).toEqual({
      overflow: 'hidden',
    });
  });

  it('hides the bar of the axis it scrolls along', () => {
    expect(
      scrollRules(SCROLL, { showsVerticalScrollIndicator: false }).classNames,
    ).toEqual([CLASS_NAMES.scrollY, CLASS_NAMES.noScrollbar]);
    expect(
      scrollRules(HORIZONTAL_SCROLL, { showsHorizontalScrollIndicator: false })
        .classNames,
    ).toEqual([CLASS_NAMES.scrollX, CLASS_NAMES.noScrollbar]);
  });

  it('keeps the bar of one axis when only the other asks to hide', () => {
    expect(
      scrollRules(SCROLL, { showsHorizontalScrollIndicator: false }).classNames,
    ).toEqual([CLASS_NAMES.scrollY]);
  });

  it('leaves every other tag alone', () => {
    expect(scrollRules('', { scrollEnabled: false })).toEqual({
      classNames: [],
      css: {},
    });
  });

  it('reaches the element spec of a scroller through its tag', () => {
    const spec = domSpecOf('RCTScrollView', {}, undefined, SCROLL);

    expect(spec.classNames).toEqual([CLASS_NAMES.view, CLASS_NAMES.scrollY]);
  });

  it('snaps a paging scroller to the children of its content, along its own axis', () => {
    expect(scrollRules(SCROLL, { pagingEnabled: true }).classNames).toEqual([
      CLASS_NAMES.scrollY,
      CLASS_NAMES.snapY,
    ]);
    expect(
      scrollRules(HORIZONTAL_SCROLL, { pagingEnabled: true }).classNames,
    ).toEqual([CLASS_NAMES.scrollX, CLASS_NAMES.snapX]);
    expect(RESET_CSS).toContain(
      `.${CLASS_NAMES.snapY}{scroll-snap-type:y mandatory}`,
    );
    expect(RESET_CSS).toContain(
      `.${CLASS_NAMES.snapY}>*>*{scroll-snap-align:start}`,
    );
  });

  it('does not snap a scroller that is not paging', () => {
    expect(scrollRules(SCROLL, { pagingEnabled: false }).classNames).toEqual([
      CLASS_NAMES.scrollY,
    ]);
    expect(scrollRules('', { pagingEnabled: true }).classNames).toEqual([]);
  });

  it('keeps the scroll from chaining to the page when it may not bounce', () => {
    expect(scrollRules(SCROLL, { bounces: false }).css).toEqual({
      'overscroll-behavior': 'none',
    });
    expect(scrollRules(SCROLL, { bounces: true }).css).toEqual({});
  });

  it('does not report the props that tune a native feel as skipped', () => {
    const skipped: string[] = [];

    domSpecOf(
      'RCTScrollView',
      {
        pagingEnabled: true,
        bounces: false,
        scrollEventThrottle: 16,
        decelerationRate: 'fast',
        alwaysBounceVertical: true,
        directionalLockEnabled: true,
        nestedScrollEnabled: true,
        overScrollMode: 'never',
      },
      key => skipped.push(key),
      SCROLL,
    );

    expect(skipped).toEqual([]);
  });

  it('does not report the scroll props as skipped', () => {
    const skipped: string[] = [];

    domSpecOf(
      'RCTScrollView',
      { scrollEnabled: false, showsVerticalScrollIndicator: false },
      key => skipped.push(key),
      SCROLL,
    );

    expect(skipped).toEqual([]);
  });

  it('centers content smaller than the scroller, and lets larger content scroll from the start', () => {
    expect([
      scrollRules(SCROLL, { centerContent: true }).classNames,
      scrollRules(HORIZONTAL_SCROLL, { centerContent: true }).classNames,
      scrollRules(SCROLL, { centerContent: false }).classNames,
    ]).toEqual([
      [CLASS_NAMES.scrollY, CLASS_NAMES.centerContent],
      [CLASS_NAMES.scrollX, CLASS_NAMES.centerContent],
      [CLASS_NAMES.scrollY],
    ]);
    expect(RESET_CSS).toContain(`.${CLASS_NAMES.centerContent}>*{margin:auto}`);
  });

  it('owns contentOffset, which the host writes once as the scroll position', () => {
    const skipped: string[] = [];

    domSpecOf(
      'RCTScrollView',
      { contentOffset: { x: 0, y: 10 } },
      key => skipped.push(key),
      SCROLL,
    );

    expect(skipped).toEqual([]);
  });
});
