// The sheet footer of react-native-screens: a native view beside the header config of a `formSheet`
// Core decides whether it exists, an adapter renders the app content inside it

import {
  RNS_SCREEN_FOOTER_VIEW_NAME,
  STACK_FORM_SHEET_PRESENTATION,
} from './constants';
import type { IStackPresentation } from './navigator-props';

export type ISheetFooterInput = {
  stackPresentation: IStackPresentation | undefined;
  hasFooter: boolean;
};

export type ISheetFooterHost = {
  viewName: string;
  props: Record<string, unknown>;
};

// Native finds the footer by its class, so Fabric must never flatten it away
const FOOTER_PROPS = { collapsable: false };

export function resolveSheetFooterHost(
  input: ISheetFooterInput,
): ISheetFooterHost | undefined {
  const isFormSheet = input.stackPresentation === STACK_FORM_SHEET_PRESENTATION;
  if (!input.hasFooter || !isFormSheet) return undefined;
  return { viewName: RNS_SCREEN_FOOTER_VIEW_NAME, props: FOOTER_PROPS };
}

export type ISheetFooterOptions<TContent> = {
  stackPresentation?: IStackPresentation;
  sheetFooter?: () => TContent;
};

// The app function runs only for a footer that exists, an adapter makes the element of its host
export function resolveSheetFooterElements<TElement, TContent>(
  options: ISheetFooterOptions<TContent>,
  create: (host: ISheetFooterHost, content: TContent) => TElement,
): TElement[] {
  const { sheetFooter } = options;
  const host = resolveSheetFooterHost({
    stackPresentation: options.stackPresentation,
    hasFooter: sheetFooter !== undefined,
  });
  if (host === undefined || sheetFooter === undefined) return [];
  return [create(host, sheetFooter())];
}
