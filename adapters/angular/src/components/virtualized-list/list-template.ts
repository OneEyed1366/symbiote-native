// Same body on both axes, only the outer tag differs
// Written out once per branch: ngc needs one literal, no shared outlet primitive exists
export const VIRTUALIZED_LIST_TEMPLATE = `
    @if (isHorizontal) {
      <horizontal-scroll-view #scrollHost [symbioteHostProps]="scrollViewBag()">
        @if (shouldRenderRefreshControl) {
          <refresh-control
            [symbioteHostProps]="refreshControlBag()"
          ></refresh-control>
        }

        @if (headerDir !== undefined) {
          <view>
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </view>
        }

        @if (itemCount === 0) {
          @if (emptyDir !== undefined) {
            <view>
              <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
            </view>
          }
        } @else {
          @if (leadingSpacerStyle !== null) {
            <view [style]="leadingSpacerStyle"></view>
          }
          @if (forcedStickyCell !== null) {
            <sticky-header
              (layout)="handleCellLayout(forcedStickyCell.measure, $event)"
              [style]="cellStyle"
            >
              <ng-container
                [vListOutlet]="cellTemplate"
                [vListOutletContext]="forcedStickyCell.context"
              ></ng-container>
            </sticky-header>
          }
          @if (gapSpacerStyle !== null) {
            <view [style]="gapSpacerStyle"></view>
          }
          @for (cell of windowCells; track cell.key) {
            @if (cell.isSticky) {
              <sticky-header
                (layout)="handleCellLayout(cell.measure, $event)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="cell.context"
                ></ng-container>
                @if (cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="cell.separatorContext"
                  ></ng-container>
                }
              </sticky-header>
            } @else {
              <view
                (layout)="handleCellLayout(cell.measure, $event)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="cell.context"
                ></ng-container>
                @if (cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="cell.separatorContext"
                  ></ng-container>
                }
              </view>
            }
          }
          @if (trailingSpacerStyle !== null) {
            <view [style]="trailingSpacerStyle"></view>
          }
        }

        @if (footerDir !== undefined) {
          <view>
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </view>
        }
      </horizontal-scroll-view>
    } @else {
      <scroll-view #scrollHost [symbioteHostProps]="scrollViewBag()">
        @if (shouldRenderRefreshControl) {
          <refresh-control
            [symbioteHostProps]="refreshControlBag()"
          ></refresh-control>
        }

        @if (headerDir !== undefined) {
          <view>
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </view>
        }

        @if (itemCount === 0) {
          @if (emptyDir !== undefined) {
            <view>
              <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
            </view>
          }
        } @else {
          @if (leadingSpacerStyle !== null) {
            <view [style]="leadingSpacerStyle"></view>
          }
          @if (forcedStickyCell !== null) {
            <sticky-header
              (layout)="handleCellLayout(forcedStickyCell.measure, $event)"
              [style]="cellStyle"
            >
              <ng-container
                [vListOutlet]="cellTemplate"
                [vListOutletContext]="forcedStickyCell.context"
              ></ng-container>
            </sticky-header>
          }
          @if (gapSpacerStyle !== null) {
            <view [style]="gapSpacerStyle"></view>
          }
          <!-- The separator sits INSIDE the measuring view, matching RN's cell renderer, as a
               sibling it would add an extra flex gap -->
          @for (cell of windowCells; track cell.key) {
            @if (cell.isSticky) {
              <sticky-header
                (layout)="handleCellLayout(cell.measure, $event)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="cell.context"
                ></ng-container>
                @if (cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="cell.separatorContext"
                  ></ng-container>
                }
              </sticky-header>
            } @else {
              <view
                (layout)="handleCellLayout(cell.measure, $event)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="cell.context"
                ></ng-container>
                @if (cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="cell.separatorContext"
                  ></ng-container>
                }
              </view>
            }
          }
          @if (trailingSpacerStyle !== null) {
            <view [style]="trailingSpacerStyle"></view>
          }
        }

        @if (footerDir !== undefined) {
          <view>
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </view>
        }
      </scroll-view>
    }
  `;
