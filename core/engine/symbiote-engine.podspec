require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# `@symbiote-native/engine` is a DIRECT dependency of every example app, so RN's autolinking finds
# this podspec with no entry in anybody's Podfile — which is the whole reason the native module lives
# here instead of in a package of its own. A new package would have needed a release, an entry in
# every example's manifest, and a row in three parity audits; this needs a `pod install`.
#
# Note the two vendoring workarounds that `packages/{slider,navigation}` carry are absent here, on
# purpose: those podspecs glob files out of a THIRD-PARTY package that pnpm puts behind a symlink,
# and CocoaPods' recursive glob never descends into one. Our sources sit under this pod's own
# directory, so a plain downward pattern reaches them.
Pod::Spec.new do |s|
  s.name         = 'symbiote-engine'
  s.version      = package['version']
  s.summary      = 'Native store and commit hook for the SymbioteNative engine.'
  s.license      = package['license'] || 'MIT'
  s.authors      = package['author'] || 'symbiote'
  s.homepage     = package['homepage'] || 'https://github.com/symbiote/symbiote'
  s.platforms    = { :ios => '15.1', :visionos => '1.0' }
  s.source       = { :git => 'https://github.com/symbiote/symbiote.git', :tag => "v#{s.version}" }

  # `cpp/` is the platform-shared half and `ios/` is the registration shim. Android's shim will glob
  # the same `cpp/` from its own build file rather than copying anything.
  s.source_files = 'ios/**/*.{h,m,mm}', 'cpp/**/*.{h,cpp}'

  # Pulls in React-Core, the codegen'd spec pod, ReactCommon/turbomodule and the folly flags that
  # every New Architecture module needs. Defined by react-native's `react_native_pods.rb`, which the
  # app's Podfile requires before it reaches this file; the fallback keeps `pod spec lint` and any
  # non-RN evaluation from dying on an undefined method.
  if defined?(install_modules_dependencies)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
    s.dependency 'React-jsi'
    s.dependency 'ReactCommon/turbomodule/core'
    s.pod_target_xcconfig = {
      'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20'
    }
  end
end
