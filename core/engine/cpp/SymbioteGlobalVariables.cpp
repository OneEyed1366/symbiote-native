#include "SymbioteGlobalVariables.h"

namespace symbiote {

GlobalVariables &GlobalVariables::instance() {
  static GlobalVariables table;
  return table;
}

void GlobalVariables::set(std::string name, std::string value) {
  std::lock_guard<std::mutex> lock(mutex_);
  values_[std::move(name)] = std::move(value);
}

void GlobalVariables::erase(std::string_view name) {
  std::lock_guard<std::mutex> lock(mutex_);
  // The map is keyed by `std::string`, so the view is copied for the one lookup
  values_.erase(std::string(name));
}

std::optional<std::string> GlobalVariables::get(std::string_view name) const {
  std::lock_guard<std::mutex> lock(mutex_);
  auto found = values_.find(std::string(name));
  if (found == values_.end()) {
    return std::nullopt;
  }
  return found->second;
}

void GlobalVariables::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  values_.clear();
}

} // namespace symbiote
