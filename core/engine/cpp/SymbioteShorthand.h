#pragma once

#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace symbiote {

enum class ShorthandOutcome {
  // Not a shorthand, or a single value that needs no splitting: keep the style entry as it is
  kNotShorthand,
  kExpanded,
  // A shorthand RN cannot express (differing overflow axes, a fifth side): drop the entry
  kInvalid,
};

struct ShorthandResult {
  ShorthandOutcome outcome;
  // RN style key and the value text of each, in output order
  std::vector<std::pair<std::string, std::string>> longhands;
};

// Splits the substituted value of an RN style key the way `shorthands.ts` splits it at build time
ShorthandResult expandShorthand(std::string_view key, std::string_view text);

} // namespace symbiote
