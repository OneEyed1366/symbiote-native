// The events every list component exposes, from `VirtualizedList` up to `SectionList`, so the
// wrappers stop redeclaring them

import { Directive, EventEmitter, Output } from '@angular/core';
import { AccessibilityEventsBase } from '../../accessibility-events';
import {
  gateWanted,
  injectGateDemandAbove,
  type IGatedAccessibilityEvent,
} from '../../gate-demand';

@Directive()
export abstract class ListEventsBase extends AccessibilityEventsBase {
  // The edge and refresh events are real Angular events: `(endReached)`, not `[onEndReached]`
  @Output() readonly endReached = new EventEmitter<{
    distanceFromEnd: number;
  }>();
  @Output() readonly startReached = new EventEmitter<{
    distanceFromStart: number;
  }>();
  @Output() readonly refresh = new EventEmitter<void>();

  // A list binds the four gated accessibility events on what it renders, which Angular forces to be
  // unconditional and which would light that component's gates on every instance. It answers for
  // them instead, see `gate-demand.ts`
  private readonly gateDemandAbove = injectGateDemandAbove();

  wantsGate(name: IGatedAccessibilityEvent): boolean {
    return gateWanted(this.gateDemandAbove, name, this[name]);
  }
}
