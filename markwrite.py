import sys
import os
from pathlib import Path
from PySide6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget, QFileDialog, QMessageBox, QMenuBar, QMenu
from PySide6.QtGui import QAction
from PySide6.QtCore import Qt, QUrl, QTimer, QObject, Signal, Slot
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebChannel import QWebChannel

APP_NAME = "MarkWrite"
APP_VERSION = "0.1.3"
APP_BUILD = "000024"
APP_VERSION_FULL = f"{APP_VERSION} (build {APP_BUILD})"

def load_html_template():
    """Load HTML template from external file"""
    try:
        html_path = Path(__file__).parent / "editor.html"
        with open(html_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        # Fallback HTML if file not found
        return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MarkWrite Editor</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        #editor-root { height: 100vh; }
        .error { color: red; padding: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="error">
        <h2>Error: editor.html not found!</h2>
        <p>Please ensure editor.html exists in the same directory as markwrite.py</p>
    </div>
</body>
</html>"""

class MarkWriteWebPage(QWebEnginePage):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.javascript_console_messages = []

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        # Capture JavaScript console messages and display them in Python console
        level_names = {
            QWebEnginePage.InfoMessageLevel: "INFO",
            QWebEnginePage.WarningMessageLevel: "WARN",
            QWebEnginePage.ErrorMessageLevel: "ERROR"
        }
        level_name = level_names.get(level, "UNKNOWN")

        # Format the message for display
        formatted_message = f"[JS {level_name}] {message}"
        if sourceID:
            formatted_message += f" (at {sourceID}:{lineNumber})"

        # Print to Python console
        print(formatted_message)

        # Store for potential use
        self.javascript_console_messages.append(formatted_message)

class MarkWriteWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"{APP_NAME} {APP_VERSION_FULL}")
        self.setGeometry(100, 100, 1200, 800)

        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)

        # Create web view with custom page for console capture
        self.web_view = QWebEngineView()
        self.web_page = MarkWriteWebPage()
        self.web_view.setPage(self.web_page)
        layout.addWidget(self.web_view)

        # Load the HTML template
        self.web_view.setHtml(load_html_template(), QUrl.fromLocalFile(os.getcwd() + "/"))

        # Create menu bar
        self.create_menu_bar()

        # Set up JavaScript bridge
        self.setup_js_bridge()

        print(f"MarkWrite {APP_VERSION_FULL} started")
        print("Assets path:", self.get_assets_path())
        print("Assets path exists:", os.path.exists(self.get_assets_path()))
        print("CSS file exists:", os.path.exists(self.get_assets_path() / "css" / "toastui-editor.min.css"))
        print("JS file exists:", os.path.exists(self.get_assets_path() / "js" / "toastui-editor-all.min.js"))

    def get_assets_path(self):
        return Path(__file__).parent / "assets"

    def create_menu_bar(self):
        menubar = self.menuBar()

        # File menu
        file_menu = menubar.addMenu("&File")

        open_action = QAction("&Open", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self.open_file)
        file_menu.addAction(open_action)

        save_action = QAction("&Save", self)
        save_action.setShortcut("Ctrl+S")
        save_action.triggered.connect(self.save_file)
        file_menu.addAction(save_action)

        file_menu.addSeparator()

        exit_action = QAction("E&xit", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

    def setup_js_bridge(self):
        """Set up the JavaScript bridge for communication between Python and JavaScript"""
        # Create a bridge object that JavaScript can call
        self.js_bridge = MarkWriteBridge(self)

        # Set up QWebChannel for proper JavaScript communication
        self.web_channel = QWebChannel()
        self.web_channel.registerObject('markwrite', self.js_bridge)
        self.web_page.setWebChannel(self.web_channel)

        # Inject the QWebChannel JavaScript library and bridge
        self.web_view.page().runJavaScript("""
            // Load QWebChannel if not already loaded
            if (typeof QWebChannel === 'undefined') {
                var script = document.createElement('script');
                script.src = 'qrc:///qtwebchannel/qwebchannel.js';
                document.head.appendChild(script);
                script.onload = function() {
                    setupWebChannel();
                };
            } else {
                setupWebChannel();
            }

            function setupWebChannel() {
                new QWebChannel(qt.webChannelTransport, function(channel) {
                    window._markwrite = channel.objects.markwrite;
                    console.log('WebChannel bridge established with Python');
                });
            }
        """)

        # Also set up the legacy bridge for backward compatibility
        self.web_view.page().runJavaScript("""
            // Legacy bridge functions
            window._markwrite = window._markwrite || {};

            // Get markdown content
            window._markwrite.getMarkdown = function() {
                if (window.editor && window.editor.getMarkdown) {
                    return window.editor.getMarkdown();
                }
                return '';
            };

            // Set markdown content
            window._markwrite.setMarkdown = function(content) {
                if (window.editor && window.editor.setMarkdown) {
                    window.editor.setMarkdown(content);
                    // Force scroll to top and render diagrams
                    if (window.forceScrollToTop) window.forceScrollToTop();
                    if (window.renderExistingMermaidDiagrams) {
                        setTimeout(window.renderExistingMermaidDiagrams, 500);
                    }
                }
            };

            // Log function that sends messages to Python
            window._markwrite.log = function(message) {
                if (window._markwrite && window._markwrite.logMessage) {
                    window._markwrite.logMessage(message);
                } else {
                    console.log('[PYTHON] ' + message);
                }
            };
        """)

    def open_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open Markdown File", "", "Markdown Files (*.md);;All Files (*)"
        )
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Set the content in the editor
                self.web_view.page().runJavaScript(f"window._markwrite.setMarkdown({repr(content)})")

                # Update window title
                self.setWindowTitle(f"{os.path.basename(file_path)} — {APP_NAME}")

            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to open file: {str(e)}")

    def save_file(self):
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save Markdown File", "", "Markdown Files (*.md);;All Files (*)"
        )
        if file_path:
            # Use a lambda to capture file_path in the callback scope
            callback = lambda content: self.save_file_callback(content, file_path)
            self.web_view.page().runJavaScript("window._markwrite.getMarkdown()", callback)

    def save_file_callback(self, content, file_path):
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)

            # Update window title
            self.setWindowTitle(f"{os.path.basename(file_path)} — {APP_NAME}")

        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save file: {str(e)}")


class MarkWriteBridge(QObject):
    """Bridge object that JavaScript can call to communicate with Python"""

    # Define signals that JavaScript can emit
    logMessage = Signal(str)
    getMarkdownRequested = Signal()
    setMarkdownRequested = Signal(str)

    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window

        # Connect signals to slots
        self.logMessage.connect(self.handle_log_message)
        self.getMarkdownRequested.connect(self.handle_get_markdown)
        self.setMarkdownRequested.connect(self.handle_set_markdown)

    @Slot(str)
    def handle_log_message(self, message):
        """Handle log messages from JavaScript"""
        print(f"[JS] {message}")

    @Slot()
    def handle_get_markdown(self):
        """Handle markdown content requests from JavaScript"""
        # This will be handled by the legacy bridge for now
        pass

    @Slot(str)
    def handle_set_markdown(self, content):
        """Handle markdown content setting from JavaScript"""
        # This will be handled by the legacy bridge for now
        pass

    # Add methods that JavaScript can call directly
    def open(self):
        """Handle open file request from JavaScript"""
        self.main_window.open_file()

    def save(self):
        """Handle save file request from JavaScript"""
        self.main_window.save_file()

    def saveAs(self):
        """Handle save as file request from JavaScript"""
        self.main_window.save_file_as()

    def zoomIn(self):
        """Handle zoom in request from JavaScript"""
        # Implement zoom functionality
        print("[JS] Zoom in requested")

    def zoomOut(self):
        """Handle zoom out request from JavaScript"""
        # Implement zoom functionality
        print("[JS] Zoom out requested")

def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(APP_VERSION)

    window = MarkWriteWindow()
    window.show()

    sys.exit(app.exec())

if __name__ == "__main__":
    main()
