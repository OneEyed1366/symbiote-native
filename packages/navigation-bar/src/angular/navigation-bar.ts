// Angular twin of `../react`/`../vue`/`../solid`/`../svelte`'s `NavigationBar`, same shared
// stack core - only the lifecycle wiring differs per adapter
// (`components_split_logic_view_lifecycle`)

import {
  Component,
  effect,
  inject,
  Input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { ColorSchemeService } from '@symbiote-native/angular';
import {
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  type INavigationBarStackEntry,
  type INavigationBarStyle,
} from '../core';

@Component({
  selector: 'navigation-bar',
  standalone: true,
  template: '',
})
export class NavigationBar implements OnInit, OnChanges, OnDestroy {
  @Input() style?: INavigationBarStyle;
  @Input() hidden?: boolean;

  private readonly colorScheme = inject(ColorSchemeService).colorScheme;
  private stackEntry: INavigationBarStackEntry | null = null;
  private isInitialized = false;

  constructor() {
    effect(() => {
      this.colorScheme();
      if (this.stackEntry) {
        this.stackEntry = replaceStackEntry(this.stackEntry, {
          style: this.style,
          hidden: this.hidden,
        });
      }
    });
  }

  ngOnInit(): void {
    this.stackEntry = pushStackEntry({
      style: this.style,
      hidden: this.hidden,
    });
    this.isInitialized = true;
  }

  ngOnChanges(): void {
    if (!this.isInitialized || !this.stackEntry) return;
    this.stackEntry = replaceStackEntry(this.stackEntry, {
      style: this.style,
      hidden: this.hidden,
    });
  }

  ngOnDestroy(): void {
    if (this.stackEntry) popStackEntry(this.stackEntry);
  }
}
