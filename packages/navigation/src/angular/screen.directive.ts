// `symbioteScreen` is a declarative marker on an inert `<ng-template>`, never rendered on its own
// `Stack` reads its inputs through `@ContentChildren` into a name to component and options registry
// It mirrors `@ContentChildren(MatTab)` in Angular Material, the stack header says why it is safe

import { Directive, Input, type TemplateRef, type Type } from '@angular/core';
import type {
  ISearchBarCommands,
  ISearchBarOptions,
  IScreenOptions,
  IRoute,
} from '../core';
import type { INavigatorHandle } from '../core';

// The search bar commands ride a ref that cannot live in the shared `ISearchBarOptions`
// Angular has no ref type, so the app passes a plain `{ current }` cell
// `search-bar-ref.directive.ts` fills it once the native node exists
export type IAngularSearchBarOptions = ISearchBarOptions & {
  ref?: { current: ISearchBarCommands | null };
};

// A header view is a template, Stack outlets it inside the subview leaf that hosts it
export type IAngularHeaderViews = {
  headerLeft?: TemplateRef<unknown>;
  headerRight?: TemplateRef<unknown>;
  headerTitle?: TemplateRef<unknown>;
};

export type IAngularScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> &
  IAngularHeaderViews & {
    headerSearchBarOptions?: IAngularSearchBarOptions;
    // Outlet inside the native footer of a `formSheet`, ignored on any other presentation
    sheetFooter?: TemplateRef<unknown>;
  };

// Options are a plain object or a resolver that `Stack` runs outside the render lifecycle
// Its `navigation` argument is the live handle a bar button closes over, not the injected one
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (
  args: IScreenOptionsArgs,
) => IAngularScreenOptions;

@Directive({
  selector: 'ng-template[symbioteScreen]',
  standalone: true,
})
export class ScreenDirective {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) component!: Type<unknown>;
  @Input() options?: IAngularScreenOptions | IScreenOptionsResolver;
  @Input() initialParams?: unknown;
}
