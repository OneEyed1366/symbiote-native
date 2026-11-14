#pragma once

#include <string>
#include <string_view>

namespace symbiote {

// `transform` text as the JSON list RN's `processTransform` returns
// `[]` when any step breaks one of the rules RN checks in a development build
std::string transformJson(std::string_view text);

} // namespace symbiote
