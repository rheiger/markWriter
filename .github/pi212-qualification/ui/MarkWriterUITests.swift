import AppKit
import Foundation
import XCTest

@MainActor
final class MarkWriterUITests: XCTestCase {
    private func capture(_ name: String) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        print("UI state \(name): front app \(NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "unknown")")
    }

    func testSealedNativeOpenDialog() throws {
        continueAfterFailure = false
        let root = Bundle(for: Self.self).bundleURL
        let marker = URL(fileURLWithPath: "/private/tmp/markwriter-282-open.IVBVyr")
        let work = marker.deletingLastPathComponent()
        let profile = work.appendingPathComponent("open-profile", isDirectory: true)
        let fixtureDir = work.appendingPathComponent("open-fixtures", isDirectory: true)
        let fixture = fixtureDir.appendingPathComponent("Acceptance.md")
        let app = XCUIApplication(url: marker.appendingPathComponent("MarkWriter.app", isDirectory: true))
        app.launchEnvironment["MARKWRITER_PROFILE_DIR"] = profile.path
        app.launch()
        defer { app.terminate() }
        let editorWindow = app.windows.firstMatch
        XCTAssertTrue(editorWindow.waitForExistence(timeout: 15), root.path)
        let toolbarOpen = app.buttons["Open"].firstMatch
        XCTAssertTrue(toolbarOpen.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(toolbarOpen.isHittable, app.debugDescription)
        capture("1-editor")
        toolbarOpen.click()
        // Some hosted macOS versions expose the system panel in a separate process.
        // Use its standard keyboard navigation and assert the actual open result.
        RunLoop.current.run(until: Date().addingTimeInterval(0.7))
        capture("2-open")
        app.typeKey("g", modifierFlags: [.command, .shift])
        capture("3-go-to-folder")
        app.typeText(fixture.path)
        app.typeKey(.return, modifierFlags: [])
        RunLoop.current.run(until: Date().addingTimeInterval(0.7))
        app.typeKey(.return, modifierFlags: [])
        capture("4-after-open")
        let deadline = Date().addingTimeInterval(15)
        let editor = app.textViews.firstMatch
        var opened = false
        repeat {
            if let value = editor.value as? String, value.contains("Sealed PI 2.12 fixture") {
                opened = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        } while Date() < deadline
        XCTAssertTrue(opened, app.debugDescription)
        RunLoop.current.run(until: Date().addingTimeInterval(1))

    }

}
