// Same body on both axes and in the nested view, only the outer tag differs
// Written out once per branch: ngc needs one literal, and a shared outlet would add one per list
export const VIRTUALIZED_LIST_TEMPLATE = `
    @if (nesting.isNested) {
      <view #scrollHost [symbioteHostProps]="nestedViewBag()">
        @if (headerDir !== undefined) {
          <view [style]="headerStyle">
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </view>
        }

        @if (itemCount === 0) {
          @if (emptyDir !== undefined) {
            <view [style]="cellStyle">
              <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
            </view>
          }
        } @else {
          @for (row of rows; track row.key) {
            @if (row.kind === spacerKind) {
              <view [style]="row.style"></view>
            } @else if (row.renderer !== undefined) {
              @if (row.cell.isSticky) {
                <sticky-header>
                  <ng-container
                    [vListOutlet]="cellRendererTpl"
                    [vListOutletContext]="row.renderer"
                  ></ng-container>
                </sticky-header>
              } @else {
                <ng-container
                  [vListOutlet]="cellRendererTpl"
                  [vListOutletContext]="row.renderer"
                ></ng-container>
              }
            } @else if (row.cell.isSticky) {
              <sticky-header
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </sticky-header>
            } @else {
              <view
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </view>
            }
          }
        }

        @if (footerDir !== undefined) {
          <view [style]="footerStyle">
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </view>
        }
      </view>
    } @else if (isHorizontal) {
      <horizontal-scroll-view #scrollHost [symbioteHostProps]="scrollViewBag()">
        @if (shouldRenderRefreshControl) {
          <refresh-control
            [symbioteHostProps]="refreshControlBag()"
          ></refresh-control>
        }

        @if (headerDir !== undefined) {
          <view [style]="headerStyle">
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </view>
        }

        @if (itemCount === 0) {
          @if (emptyDir !== undefined) {
            <view [style]="cellStyle">
              <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
            </view>
          }
        } @else {
          @for (row of rows; track row.key) {
            @if (row.kind === spacerKind) {
              <view [style]="row.style"></view>
            } @else if (row.renderer !== undefined) {
              @if (row.cell.isSticky) {
                <sticky-header>
                  <ng-container
                    [vListOutlet]="cellRendererTpl"
                    [vListOutletContext]="row.renderer"
                  ></ng-container>
                </sticky-header>
              } @else {
                <ng-container
                  [vListOutlet]="cellRendererTpl"
                  [vListOutletContext]="row.renderer"
                ></ng-container>
              }
            } @else if (row.cell.isSticky) {
              <sticky-header
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </sticky-header>
            } @else {
              <view
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </view>
            }
          }
        }

        @if (footerDir !== undefined) {
          <view [style]="footerStyle">
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
          <view [style]="headerStyle">
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </view>
        }

        @if (itemCount === 0) {
          @if (emptyDir !== undefined) {
            <view [style]="cellStyle">
              <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
            </view>
          }
        } @else {
          <!-- The separator sits INSIDE the measuring view, matching RN's cell renderer, as a
               sibling it would add an extra flex gap -->
          @for (row of rows; track row.key) {
            @if (row.kind === spacerKind) {
              <view [style]="row.style"></view>
            } @else if (row.renderer !== undefined) {
              @if (row.cell.isSticky) {
                <sticky-header>
                  <ng-container
                    [vListOutlet]="cellRendererTpl"
                    [vListOutletContext]="row.renderer"
                  ></ng-container>
                </sticky-header>
              } @else {
                <ng-container
                  [vListOutlet]="cellRendererTpl"
                  [vListOutletContext]="row.renderer"
                ></ng-container>
              }
            } @else if (row.cell.isSticky) {
              <sticky-header
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </sticky-header>
            } @else {
              <view
                (layout)="handleCellLayout(row.cell.measure, $event, row.cell.index)"
                (focus)="handleCellFocus(row.cell.index)"
                [style]="cellStyle"
              >
                <ng-container
                  [vListOutlet]="cellTemplate"
                  [vListOutletContext]="row.cell.context"
                ></ng-container>
                @if (row.cell.separatorContext !== undefined) {
                  <ng-container
                    [vListOutlet]="separatorTemplate"
                    [vListOutletContext]="row.cell.separatorContext"
                  ></ng-container>
                }
              </view>
            }
          }
        }

        @if (footerDir !== undefined) {
          <view [style]="footerStyle">
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </view>
        }
      </scroll-view>
    }

    <!-- What a \`vListCell\` wrapper stamps for its item and separator, once per list -->
    <ng-template #cellBody let-cell>
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
    </ng-template>
  `;
