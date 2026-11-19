#include "SymbioteVarSubstitute.h"

#include <algorithm>
#include <cctype>

namespace symbiote {
namespace {

// A longer chain is invalid, so recursion cannot overflow the stack
constexpr size_t kMaxDepth = 512;
// Past this a result is invalid, which bounds an exponential doubling chain
constexpr size_t kMaxSubstitutedBytes = 2'097'152;
constexpr std::string_view kWhitespace = " \t\r\n\f";
constexpr std::string_view kVarCall = "var(";
constexpr std::string_view kNamePrefix = "--";
constexpr size_t kPairLength = 2;

std::string_view trim(std::string_view text) {
  const size_t first = text.find_first_not_of(kWhitespace);
  if (first == std::string_view::npos) {
    return {};
  }
  return text.substr(first, text.find_last_not_of(kWhitespace) - first + 1);
}

size_t skipSpace(std::string_view text, size_t from) {
  const size_t next = text.find_first_not_of(kWhitespace, from);
  return next == std::string_view::npos ? text.size() : next;
}

bool isNameChar(char c) {
  const auto byte = static_cast<unsigned char>(c);
  return std::isalnum(byte) != 0 || c == '-' || c == '_' || byte >= 0x80;
}

bool startsVarCall(std::string_view text, size_t at) {
  if (at + kVarCall.size() > text.size()) {
    return false;
  }
  const bool isCall = std::equal(kVarCall.begin(), kVarCall.end(), text.begin() + at,
                                 [](char want, char got) {
                                   return want == std::tolower(static_cast<unsigned char>(got));
                                 });
  return isCall && (at == 0 || !(isNameChar(text[at - 1]) || text[at - 1] == '\\'));
}

// The end of a string, comment or escape starting at `at`, or `at` itself when none does
size_t opaqueSpanEnd(std::string_view text, size_t at) {
  const char c = text[at];
  if (c == '\\') {
    return std::min(at + kPairLength, text.size());
  }
  if (c == '/' && at + 1 < text.size() && text[at + 1] == '*') {
    const size_t close = text.find("*/", at + kPairLength);
    return close == std::string_view::npos ? text.size() : close + kPairLength;
  }
  if (c != '"' && c != '\'') {
    return at;
  }
  size_t i = at + 1;
  while (i < text.size() && text[i] != c) {
    i += text[i] == '\\' ? kPairLength : 1;
  }
  return std::min(i + 1, text.size());
}

// Keeps `closers` in step with the brackets seen, false for a closer that matches nothing
bool trackBracket(char c, std::vector<char> &closers) {
  switch (c) {
    case '(': closers.push_back(')'); return true;
    case '[': closers.push_back(']'); return true;
    case '{': closers.push_back('}'); return true;
    case ')':
    case ']':
    case '}':
      if (closers.empty() || closers.back() != c) {
        return false;
      }
      closers.pop_back();
      return true;
    default: return true;
  }
}

// `at` follows the comma; the fallback runs to the `)` that closes the call
std::optional<VarReference> parseFallback(std::string_view text, std::string_view name, size_t at) {
  std::vector<char> closers;
  size_t i = at;
  while (i < text.size()) {
    const size_t opaqueEnd = opaqueSpanEnd(text, i);
    if (opaqueEnd > i) {
      i = opaqueEnd;
      continue;
    }
    if (text[i] == ')' && closers.empty()) {
      return VarReference{name, text.substr(at, i - at), i + 1};
    }
    if (!trackBracket(text[i], closers)) {
      return std::nullopt;
    }
    ++i;
  }
  return std::nullopt;
}

// `at` follows `var(`; the grammar is ws `--name` ws then `)` or `,` and a fallback
std::optional<VarReference> parseReference(std::string_view text, size_t at) {
  const size_t nameStart = skipSpace(text, at);
  if (!text.substr(nameStart).starts_with(kNamePrefix)) {
    return std::nullopt;
  }
  size_t i = nameStart + kNamePrefix.size();
  const size_t bodyStart = i;
  while (i < text.size() && (text[i] == '\\' || isNameChar(text[i]))) {
    i += text[i] == '\\' ? kPairLength : 1;
  }
  i = std::min(i, text.size());
  if (i == bodyStart) {
    return std::nullopt;
  }
  const std::string_view name = text.substr(nameStart, i - nameStart);
  i = skipSpace(text, i);
  if (i >= text.size()) {
    return std::nullopt;
  }
  if (text[i] == ')') {
    return VarReference{name, std::nullopt, i + 1};
  }
  return text[i] == ',' ? parseFallback(text, name, i + 1) : std::nullopt;
}

} // namespace

VarResolver::VarResolver(VarLookup lookup, VarComputed computed, VarRejects rejects)
    : lookup_(std::move(lookup)), computed_(std::move(computed)), rejects_(std::move(rejects)) {}

VarResolver::VarResolver(PlainVarLookup lookup, VarComputed computed)
    : lookup_([plain = std::move(lookup)](std::string_view name, VarScope) {
        std::optional<VarDeclared> declared;
        if (auto text = plain(name)) {
          declared = VarDeclared{std::move(*text), nullptr};
        }
        return declared;
      }),
      computed_(std::move(computed)) {}

std::optional<std::string> VarResolver::substitute(std::string_view value) {
  aborted_ = false;
  return substituteAt(value, 0, Mode::kResolve, nullptr);
}

std::optional<std::string> VarResolver::computed(std::string_view name) {
  aborted_ = false;
  return computedAt(name, 0, nullptr);
}

VarResolver::Resolved VarResolver::substituteAt(std::string_view value, size_t depth, Mode mode,
                                                VarScope scope) {
  if (depth > kMaxDepth) {
    aborted_ = true;
    return std::nullopt;
  }
  std::string out;
  std::vector<char> closers;
  size_t i = 0;
  while (i < value.size()) {
    const size_t opaqueEnd = opaqueSpanEnd(value, i);
    if (opaqueEnd > i) {
      out.append(value.substr(i, opaqueEnd - i));
      i = opaqueEnd;
    } else if (startsVarCall(value, i)) {
      const auto reference = parseReference(value, i + kVarCall.size());
      const Resolved text =
          reference ? referenceText(*reference, depth, mode, scope) : std::nullopt;
      if (!text) {
        return std::nullopt;
      }
      out.append(*text);
      i = reference->end;
    } else {
      if (!trackBracket(value[i], closers)) {
        return std::nullopt;
      }
      out.push_back(value[i++]);
    }
    if (out.size() > kMaxSubstitutedBytes) {
      return std::nullopt;
    }
  }
  return closers.empty() ? Resolved(std::move(out)) : std::nullopt;
}

VarResolver::Resolved VarResolver::referenceText(const VarReference &reference, size_t depth,
                                                 Mode mode, VarScope scope) {
  const std::string_view fallback = trim(reference.fallback.value_or(std::string_view()));
  if (reference.fallback && !substituteAt(fallback, depth + 1, Mode::kValidate, scope)) {
    return std::nullopt;
  }
  if (mode == Mode::kValidate) {
    return std::string();
  }
  if (Resolved declared = computedAt(reference.name, depth + 1, scope)) {
    return declared;
  }
  if (aborted_ || !reference.fallback) {
    return std::nullopt;
  }
  return substituteAt(fallback, depth + 1, Mode::kResolve, scope);
}

VarResolver::Resolved VarResolver::computedAt(std::string_view name, size_t depth,
                                              VarScope from) {
  const auto key = std::make_pair(from, std::string(name));
  if (const auto known = done_.find(key); known != done_.end()) {
    return known->second;
  }
  const std::optional<VarDeclared> declared = lookup_(name, from);
  if (!declared) {
    return done_[key] = std::nullopt;
  }
  const auto onStack = std::find_if(stack_.begin(), stack_.end(), [&](const Frame &frame) {
    return frame.name == key.second && frame.scope == declared->scope;
  });
  if (onStack != stack_.end()) {
    std::for_each(onStack, stack_.end(), [](Frame &frame) { frame.inCycle = true; });
    return std::nullopt;
  }
  stack_.push_back({key.second, declared->scope, false});
  Resolved value = substituteAt(trim(declared->text), depth + 1, Mode::kResolve, declared->scope);
  const bool inCycle = stack_.back().inCycle;
  stack_.pop_back();
  if (aborted_) {
    return std::nullopt;
  }
  Resolved settled = inCycle ? std::nullopt : std::move(value);
  if (declared->above != nullptr && rejects_ && rejects_(name, settled)) {
    Resolved inherited = computedAt(name, depth + 1, declared->above);
    return done_[key] = std::move(inherited);
  }
  if (computed_) settled = computed_(name, settled);
  return done_[key] = std::move(settled);
}

} // namespace symbiote
