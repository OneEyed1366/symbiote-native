#pragma once

#include <optional>
#include <string>
#include <string_view>

#include "SymbioteStyleText.h"

namespace symbiote {

// The JSON RN's JS processors build for `boxShadow`, `filter` and `transform`, from their CSS text
// `nullopt` means the key has no such processor
std::optional<std::string> structuredStyleJson(
    std::string_view key, std::string_view text, const ColorParser &parseColor);

} // namespace symbiote
