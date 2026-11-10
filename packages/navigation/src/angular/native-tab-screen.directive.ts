// `symbioteNativeTabScreen` is NativeTab's marker, a route read through @ContentChildren
// NativeTab mounts every route in its own native screen, native decides which one is visible

import { Directive, Input, type Type } from '@angular/core';
import type {
  INativeTabsViewScreenOptions,
  IRoute,
  ITabNavigatorHandle,
} from '../core';

export type INativeTabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type INativeTabScreenOptionsResolver = (
  args: INativeTabScreenOptionsArgs,
) => INativeTabsViewScreenOptions;

@Directive({
  selector: 'ng-template[symbioteNativeTabScreen]',
  standalone: true,
})
export class NativeTabScreenDirective {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) component!: Type<unknown>;
  @Input() options?:
    INativeTabsViewScreenOptions | INativeTabScreenOptionsResolver;
  @Input() initialParams?: unknown;
}
