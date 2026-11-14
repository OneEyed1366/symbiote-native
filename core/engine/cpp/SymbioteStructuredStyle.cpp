#include "SymbioteStructuredStyle.h"

#include "SymbioteFilter.h"
#include "SymbioteShadow.h"
#include "SymbioteTransform.h"

namespace symbiote {

std::optional<std::string> structuredStyleJson(
    std::string_view key, std::string_view text, const ColorParser &parseColor) {
  if (key == "boxShadow") return boxShadowJson(text, parseColor);
  if (key == "filter") return filterJson(text, parseColor);
  if (key == "transform") return transformJson(text);
  return std::nullopt;
}

} // namespace symbiote
