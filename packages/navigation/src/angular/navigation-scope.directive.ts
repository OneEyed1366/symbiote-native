// One directive instance is one fresh scope, as it re-provides `NavigationContextService`
// A descendant's `inject(NavigationContextService)` resolves to the nearest enclosing scope

import { Directive, Input, inject, type OnChanges } from '@angular/core';
import type {
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
  ITransitionProgress,
} from '../core';
import {
  NavigationContextService,
  type IAnyNavigatorHandle,
} from './navigation-context.service';

@Directive({
  selector: '[symbioteNavigationScope]',
  standalone: true,
  providers: [NavigationContextService],
})
export class NavigationScopeDirective implements OnChanges {
  @Input({ required: true, alias: 'symbioteNavigationScope' })
  route!: IRoute<unknown>;
  @Input({ required: true }) navigation!: IAnyNavigatorHandle;
  @Input({ required: true }) emitter!: INavigationEmitter;
  @Input() transitionProgress?: ITransitionProgress;
  @Input() edgeInsets?: IEdgeInsetState;

  private readonly context = inject(NavigationContextService);

  ngOnChanges(): void {
    this.context.setRoute(this.route);
    this.context.navigation = this.navigation;
    this.context.emitter = this.emitter;
    this.context.transitionProgress = this.transitionProgress;
    this.context.edgeInsets = this.edgeInsets;
  }
}
