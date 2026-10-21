import XCTest
import UIKit

@MainActor
final class CanaryCatalystUITests: XCTestCase {
  private let app = XCUIApplication()

  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launch()
    XCTAssertTrue(app.staticTexts["catalyst-count"].waitForExistence(timeout: 30))
    app.buttons["catalyst-reset"].tap()
  }

  override func tearDownWithError() throws {
    app.terminate()
  }

  private func assertLabel(_ identifier: String, _ expected: String) {
    let element = app.staticTexts[identifier]
    let match = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "label == %@", expected), object: element)
    XCTAssertEqual(XCTWaiter.wait(for: [match], timeout: 5), .completed,
      "\(identifier): expected \(expected), got \(element.label)")
  }

  func testEventsAndPersistenceAcrossRelaunch() {
    app.buttons["catalyst-increment"].tap()
    assertLabel("catalyst-count", "Count: 1")
    app.terminate()
    app.launch()
    XCTAssertTrue(app.staticTexts["catalyst-count"].waitForExistence(timeout: 30))
    assertLabel("catalyst-count", "Count: 1")
  }

  func testTextInputAndRemount() {
    let input = app.textFields["catalyst-input"]
    input.tap()
    input.typeText("Catalyst")
    assertLabel("catalyst-output", "Input: Catalyst")
    app.buttons["catalyst-toggle"].tap()
    XCTAssertFalse(input.exists)
    app.buttons["catalyst-toggle"].tap()
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    XCTAssertEqual(input.value as? String, "Catalyst")
  }

  func testKeyboardClipboardRoundTrip() {
    let pasteboard = UIPasteboard.general
    let previous = pasteboard.items
    defer { pasteboard.items = previous }

    let input = app.textFields["catalyst-input"]
    input.tap()
    input.typeText("Clipboard canary")
    input.typeKey("a", modifierFlags: .command)
    input.typeKey("c", modifierFlags: .command)
    input.typeKey(XCUIKeyboardKey.delete.rawValue, modifierFlags: [])
    assertLabel("catalyst-output", "Input: ")
    input.typeKey("v", modifierFlags: .command)
    assertLabel("catalyst-output", "Input: Clipboard canary")
  }

  func testScrollingAndWindowResize() {
    let window = app.windows.firstMatch
    let original = window.frame
    let corner = window.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1))
      .withOffset(CGVector(dx: -2, dy: -2))
    corner.press(forDuration: 0.2, thenDragTo: corner.withOffset(CGVector(dx: -120, dy: -80)))
    XCTAssertNotEqual(window.frame.size, original.size)
    XCTAssertTrue(app.buttons["catalyst-increment"].isHittable)

    let scroll = app.scrollViews["catalyst-scroll"]
    let last = app.staticTexts["catalyst-row-39"]
    XCTAssertFalse(last.isHittable)
    for _ in 0..<8 where !last.isHittable {
      scroll.swipeUp()
    }
    XCTAssertTrue(last.isHittable)
  }
}
