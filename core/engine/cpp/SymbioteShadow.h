#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "SymbioteStyleText.h"

namespace symbiote {

// What one shadow entry holds before its lengths are read: the length tokens in order
struct ShadowTokens {
  std::vector<std::string> lengths;
  std::optional<long long> color;
  bool inset = false;
};

// Sorts the whitespace-separated tokens of one shadow into lengths, a colour and `inset`
// `nullopt` is invalid: a repeated colour, a length after a keyword or more than `maxLengths`
std::optional<ShadowTokens> splitShadowTokens(
    std::string_view entry, size_t maxLengths, bool allowsInset, const ColorParser &parseColor);

// `box-shadow` text as the JSON list RN's `processBoxShadow` returns, `[]` when anything is invalid
std::string boxShadowJson(std::string_view text, const ColorParser &parseColor);

} // namespace symbiote
