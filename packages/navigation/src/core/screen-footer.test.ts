// The sheet footer is a native view beside the header config, only a `formSheet` has room for it

import { describe, expect, it } from 'vitest';
import {
  resolveSheetFooterElements,
  resolveSheetFooterHost,
} from './screen-footer';

describe('sheet footer host', () => {
  it('is a native footer view for a form sheet with a footer', () => {
    const host = resolveSheetFooterHost({
      stackPresentation: 'formSheet',
      hasFooter: true,
    });

    expect(host?.viewName).toBe('RNSScreenFooter');
  });

  it('stays a real view, as native finds the footer by its class', () => {
    const host = resolveSheetFooterHost({
      stackPresentation: 'formSheet',
      hasFooter: true,
    });

    expect(host?.props).toEqual({ collapsable: false });
  });

  it.each(['push', 'modal', 'pageSheet', undefined] as const)(
    'is absent for the %s presentation',
    stackPresentation => {
      expect(
        resolveSheetFooterHost({ stackPresentation, hasFooter: true }),
      ).toBeUndefined();
    },
  );

  it('is absent when the screen sets no footer', () => {
    expect(
      resolveSheetFooterHost({
        stackPresentation: 'formSheet',
        hasFooter: false,
      }),
    ).toBeUndefined();
  });
});

describe('sheet footer elements', () => {
  const create = (host: { viewName: string }, content: string) =>
    `${host.viewName}:${content}`;

  it('builds one element from the app content on a form sheet', () => {
    const elements = resolveSheetFooterElements(
      { stackPresentation: 'formSheet', sheetFooter: () => 'bar' },
      create,
    );

    expect(elements).toEqual(['RNSScreenFooter:bar']);
  });

  it('builds nothing when the screen sets no footer', () => {
    const elements = resolveSheetFooterElements(
      { stackPresentation: 'formSheet' },
      create,
    );

    expect(elements).toEqual([]);
  });

  it('never runs the app function outside a form sheet, as its content would be wasted', () => {
    let calls = 0;
    const sheetFooter = () => {
      calls += 1;
      return 'bar';
    };

    const elements = resolveSheetFooterElements(
      { stackPresentation: 'push', sheetFooter },
      create,
    );

    expect(elements).toEqual([]);
    expect(calls).toBe(0);
  });
});
