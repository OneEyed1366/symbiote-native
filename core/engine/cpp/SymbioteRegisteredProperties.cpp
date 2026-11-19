#include "SymbioteRegisteredProperties.h"

#include <cctype>
#include <utility>

#include "SymbioteComputedValue.h"

namespace symbiote {

namespace {

constexpr std::string_view kNamePrefix = "--";
constexpr std::string_view kVarCall = "var(";
// An animated value makes a new text every frame, so the memo starts over instead of growing
constexpr size_t kMemoLimit = 64;

// `--` and an identifier: alphanumerics, `-`, `_`, non-ASCII, and `\` with the char it escapes
bool isCustomPropertyName(std::string_view name) {
  if (name.size() <= kNamePrefix.size() || name.substr(0, kNamePrefix.size()) != kNamePrefix) {
    return false;
  }
  for (size_t at = kNamePrefix.size(); at < name.size(); at += 1) {
    const auto byte = static_cast<unsigned char>(name[at]);
    if (name[at] == '\\') {
      at += 1;
      if (at >= name.size() || name[at] == '\n' || name[at] == '\0') return false;
    } else if (std::isalnum(byte) == 0 && name[at] != '-' && name[at] != '_' && byte < 0x80) {
      return false;
    }
  }
  return true;
}

bool holdsVarCall(std::string_view text) {
  for (size_t at = 0; at + kVarCall.size() <= text.size(); at += 1) {
    bool same = true;
    for (size_t offset = 0; same && offset < kVarCall.size(); offset += 1) {
      const char c = text[at + offset];
      same = (c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c) == kVarCall[offset];
    }
    if (same) return true;
  }
  return false;
}

} // namespace

RegisteredProperties &RegisteredProperties::instance() {
  static RegisteredProperties table;
  return table;
}

void RegisteredProperties::setColorParser(ColorParser parser) {
  std::lock_guard<std::mutex> lock(mutex_);
  parseColor_ = std::move(parser);
  colorGeneration_.fetch_add(1);
}

ColorParser RegisteredProperties::colorParser() const {
  ColorParser parseColor;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    parseColor = parseColor_;
  }
  if (!parseColor) {
    parseColor = [](const std::string &) { return std::optional<long long>(); };
  }
  return parseColor;
}

bool RegisteredProperties::matches(
    const RegisteredProperty &property, std::string_view text, ValueContext context) const {
  return matchesSyntax(property.syntax, text, context, colorParser());
}

RegisterOutcome RegisteredProperties::add(
    std::string_view name,
    std::string_view syntaxText,
    bool inherits,
    const std::optional<std::string> &initialValue) {
  if (!isCustomPropertyName(name)) return RegisterOutcome::kBadName;
  const std::optional<Syntax> syntax = parseSyntax(syntaxText);
  if (!syntax.has_value()) return RegisterOutcome::kBadSyntax;
  RegisteredProperty property{*syntax, inherits, initialValue, std::make_shared<ComputedMemo>()};
  if (!syntax->isUniversal && !initialValue.has_value()) {
    return RegisterOutcome::kMissingInitialValue;
  }
  if (initialValue.has_value() &&
      (holdsVarCall(*initialValue) || !matches(property, *initialValue, ValueContext::kInitialValue))) {
    return RegisterOutcome::kBadInitialValue;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  const auto [at, isNew] = properties_.emplace(
      std::string(name), std::make_shared<const RegisteredProperty>(std::move(property)));
  count_.store(properties_.size());
  return isNew ? RegisterOutcome::kRegistered : RegisterOutcome::kAlreadyRegistered;
}

std::shared_ptr<const RegisteredProperty> RegisteredProperties::share(std::string_view name) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto found = properties_.find(std::string(name));
  return found == properties_.end() ? nullptr : found->second;
}

std::optional<RegisteredProperty> RegisteredProperties::find(std::string_view name) const {
  const std::shared_ptr<const RegisteredProperty> shared = share(name);
  if (shared == nullptr) return std::nullopt;
  return *shared;
}

bool RegisteredProperties::remove(std::string_view name) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool wasRegistered = properties_.erase(std::string(name)) > 0;
  count_.store(properties_.size());
  return wasRegistered;
}

bool RegisteredProperties::declarationApplies(
    const RegisteredProperty &property, std::string_view text) const {
  if (property.syntax.isUniversal || holdsVarCall(text)) return true;
  return matchesDeclared(property, text);
}

void RegisteredProperties::dropStale(ComputedMemo &memo) const {
  const size_t generation = colorGeneration_.load();
  if (memo.colorGeneration == generation) return;
  memo.answers.clear();
  memo.declaredMatches.clear();
  memo.colorGeneration = generation;
}

bool RegisteredProperties::matchesDeclared(const RegisteredProperty &property, std::string_view text) const {
  if (property.memo == nullptr) return matches(property, text, ValueContext::kDeclared);
  ComputedMemo &memo = *property.memo;
  const std::string key(text);
  {
    std::lock_guard<std::mutex> lock(memo.mutex);
    dropStale(memo);
    const auto known = memo.declaredMatches.find(key);
    if (known != memo.declaredMatches.end()) return known->second;
  }
  const bool answer = matches(property, text, ValueContext::kDeclared);
  std::lock_guard<std::mutex> lock(memo.mutex);
  if (memo.declaredMatches.size() >= kMemoLimit) memo.declaredMatches.clear();
  memo.declaredMatches.emplace(key, answer);
  return answer;
}

std::optional<std::string> RegisteredProperties::computedValue(
    const RegisteredProperty &property, const std::optional<std::string> &substituted) const {
  if (property.memo == nullptr || !substituted.has_value()) return computeValue(property, substituted);
  ComputedMemo &memo = *property.memo;
  {
    std::lock_guard<std::mutex> lock(memo.mutex);
    dropStale(memo);
    const auto known = memo.answers.find(*substituted);
    if (known != memo.answers.end()) return known->second;
  }
  std::optional<std::string> answer = computeValue(property, substituted);
  std::lock_guard<std::mutex> lock(memo.mutex);
  if (memo.answers.size() >= kMemoLimit) memo.answers.clear();
  memo.answers.emplace(*substituted, answer);
  return answer;
}

std::optional<std::string> RegisteredProperties::computeValue(
    const RegisteredProperty &property, const std::optional<std::string> &substituted) const {
  const ColorParser parseColor = colorParser();
  if (substituted.has_value()) {
    const std::string text(trimmed(*substituted));
    if (matchesDeclared(property, text)) {
      return computedText(property.syntax, text, parseColor);
    }
  }
  if (property.syntax.isUniversal && !substituted.has_value()) return std::nullopt;
  if (!property.initialValue.has_value()) return std::nullopt;
  return computedText(property.syntax, *property.initialValue, parseColor);
}

std::optional<std::string> RegisteredProperties::settle(
    std::string_view name, const std::optional<std::string> &substituted) const {
  if (isEmpty()) return substituted;
  const std::shared_ptr<const RegisteredProperty> property = share(name);
  if (property == nullptr) return substituted;
  return computedValue(*property, substituted);
}

bool RegisteredProperties::rejects(
    std::string_view name, const std::optional<std::string> &substituted) const {
  if (isEmpty()) return false;
  const std::shared_ptr<const RegisteredProperty> property = share(name);
  if (property == nullptr || property->syntax.isUniversal) return false;
  if (!substituted.has_value()) return true;
  return !matchesDeclared(*property, trimmed(*substituted));
}

bool RegisteredProperties::isEmpty() const {
  return count_.load() == 0;
}

VarResolver registryResolver(VarLookup lookup) {
  return VarResolver(
      std::move(lookup),
      [](std::string_view name, const std::optional<std::string> &substituted) {
        return RegisteredProperties::instance().settle(name, substituted);
      },
      [](std::string_view name, const std::optional<std::string> &substituted) {
        return RegisteredProperties::instance().rejects(name, substituted);
      });
}

void RegisteredProperties::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  properties_.clear();
  count_.store(0);
}

} // namespace symbiote
