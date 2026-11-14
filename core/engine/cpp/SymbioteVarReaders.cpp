#include "SymbioteVarReaders.h"

#include <algorithm>

namespace symbiote {

VarReaders &VarReaders::instance() {
  static VarReaders readers;
  return readers;
}

void VarReaders::forgetLocked(void *owner) {
  const auto known = namesByOwner_.find(owner);
  if (known == namesByOwner_.end()) return;
  for (const std::string &name : known->second) {
    const auto owners = ownersByName_.find(name);
    if (owners == ownersByName_.end()) continue;
    owners->second.erase(owner);
    if (owners->second.empty()) ownersByName_.erase(owners);
  }
  namesByOwner_.erase(known);
}

void VarReaders::set(void *owner, const std::vector<std::string> &names) {
  std::lock_guard<std::mutex> lock(mutex_);
  forgetLocked(owner);
  if (names.empty()) return;
  std::vector<std::string> unique = names;
  std::sort(unique.begin(), unique.end());
  unique.erase(std::unique(unique.begin(), unique.end()), unique.end());
  for (const std::string &name : unique) ownersByName_[name].insert(owner);
  namesByOwner_[owner] = std::move(unique);
}

void VarReaders::forget(void *owner) {
  std::lock_guard<std::mutex> lock(mutex_);
  forgetLocked(owner);
}

std::vector<void *> VarReaders::readersOf(std::string_view name) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto owners = ownersByName_.find(std::string(name));
  if (owners == ownersByName_.end()) return {};
  return std::vector<void *>(owners->second.begin(), owners->second.end());
}

bool VarReaders::empty() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return namesByOwner_.empty();
}

void VarReaders::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  ownersByName_.clear();
  namesByOwner_.clear();
}

} // namespace symbiote
