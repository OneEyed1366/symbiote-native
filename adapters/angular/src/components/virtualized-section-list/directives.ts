// Section list slots are `<ng-template>`s carrying these directives, the list stamps the window
// through them. Each has a context guard so the `let-` bindings infer at the call site

import { Directive, TemplateRef, inject } from '@angular/core';
import type {
  ISection as ICoreSection,
  ISeparators,
} from '@symbiote-native/components';
import type { IVListSeparatorContext } from '../virtualized-list';

// A section may bring its own `item` and `separator` templates, which beat the list's
export type ISection<ItemT> = ICoreSection<ItemT> & {
  item?: TemplateRef<IVSectionItemContext<ItemT>>;
  separator?: TemplateRef<IVListSeparatorContext<ItemT>>;
};

// The `renderItem` info arg of RN, `$implicit` is the item so `let-item` binds it
export type IVSectionItemContext<ItemT> = {
  $implicit: ItemT;
  item: ItemT;
  index: number;
  section: ISection<ItemT>;
  separators: ISeparators;
};

// The `renderSectionHeader` and `renderSectionFooter` info arg, `$implicit` is the section
export type IVSectionContext<ItemT> = {
  $implicit: ISection<ItemT>;
  section: ISection<ItemT>;
};

// RN's separator props around a section edge, `props` is the same bag whole so a forwarding
// layer can pass it on without naming every key
export type IVSectionSeparatorContext<ItemT> = IVListSeparatorContext<ItemT> & {
  section?: ISection<ItemT>;
  leadingSection?: ISection<ItemT>;
  trailingSection?: ISection<ItemT>;
  props?: IVListSeparatorContext<ItemT>;
};

@Directive({ selector: '[vSectionItem]', standalone: true })
export class VSectionItemDirective<ItemT = unknown> {
  readonly templateRef =
    inject<TemplateRef<IVSectionItemContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionItemDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionItemContext<T> {
    return true;
  }
}

// Rendered above each section's items, RN's `renderSectionHeader`
@Directive({ selector: '[vSectionHeader]', standalone: true })
export class VSectionHeaderDirective<ItemT = unknown> {
  readonly templateRef =
    inject<TemplateRef<IVSectionContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionHeaderDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionContext<T> {
    return true;
  }
}

// Rendered below each section's items, RN's `renderSectionFooter`
@Directive({ selector: '[vSectionFooter]', standalone: true })
export class VSectionFooterDirective<ItemT = unknown> {
  readonly templateRef =
    inject<TemplateRef<IVSectionContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionFooterDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionContext<T> {
    return true;
  }
}

// Painted before a section's first item and after its last, RN's `SectionSeparatorComponent`
@Directive({ selector: '[vSectionSeparator]', standalone: true })
export class VSectionSeparatorDirective<ItemT = unknown> {
  readonly templateRef =
    inject<TemplateRef<IVSectionSeparatorContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionSeparatorDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionSeparatorContext<T> {
    return true;
  }
}
