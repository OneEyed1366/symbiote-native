#pragma once

// The one generated type the proxy reads: Reanimated's codegen output is not shipped in the npm
// package, and a test build has no reason to run the generator for a single boolean
#include <react/renderer/components/view/ViewProps.h>

namespace facebook::react {

class REASharedTransitionBoundaryProps : public ViewProps {
 public:
  bool isActive{false};
};

} // namespace facebook::react
