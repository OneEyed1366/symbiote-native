#pragma once

#include <string>
#include <string_view>

#include "SymbioteStyleText.h"

namespace symbiote {

// `filter` text as the JSON list RN's `processFilter` returns, `[]` when any function is invalid
std::string filterJson(std::string_view text, const ColorParser &parseColor);

} // namespace symbiote
