import { Directive, EventEmitter, Output } from '@angular/core';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { AccessibilityInputsBase } from './accessibility-inputs';

// The four accessibility callbacks as real Angular events, for components that expose them as
// outputs rather than inputs
@Directive()
export abstract class AccessibilityEventsBase extends AccessibilityInputsBase {
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
}
