import os
import sys
import argparse
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, Signal, QEvent
from PySide6.QtGui import QAction, QKeySequence, QIcon
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QFileDialog, QMessageBox, QWidget, QVBoxLayout, QToolBar, QStyle
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage

APP_NAME = "MarkWrite"
APP_VERSION = "0.1.2"
APP_BUILD = "000021"
APP_VERSION_FULL = f"{APP_VERSION} (build {APP_BUILD})"
HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
/>
<title>MarkWrite</title>

<!-- Toast UI Editor (WYSIWYG Markdown) - Local Assets -->
<link rel="stylesheet" href="assets/css/toastui-editor.min.css"/>
<script src="assets/js/toastui-editor-all.min.js"></script>

<!-- Mermaid.js for diagram rendering -->
<script src="assets/js/mermaid.min.js"></script>

<style>
  html, body { height: 100%; margin: 0; }
  #editor-root { height: 100vh; }
  /* Use full available width */
  .toastui-editor-defaultUI { width: 100%; margin: 0; }
  /* Match OS light/dark via prefers-color-scheme */
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #ddd; }
  }

  /* Mermaid diagram styling */
  .mermaid {
    text-align: center;
    margin: 20px 0;
  }

  /* Dark mode support for Mermaid */
  @media (prefers-color-scheme: dark) {
    .mermaid {
      filter: invert(1) hue-rotate(180deg);
    }
  }
</style>
</head>
<body>
<div id="editor-root"></div>
<script>
  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: true,
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    securityLevel: 'loose',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true
    }
  });

  // Initialize WYSIWYG Markdown editor
  const { Editor } = toastui;
  const editor = new Editor({
    el: document.querySelector('#editor-root'),
    height: '100vh',
    initialEditType: 'wysiwyg',
    previewStyle: 'vertical',  // has no effect in wysiwyg, but harmless
    usageStatistics: false,
    autofocus: true,
    toolbarItems: [
      ['heading', 'bold', 'italic', 'strike'],
      ['hr', 'quote'],
      ['ul', 'ol', 'task'],
      ['table'],
      ['link', 'image'],
      ['code', 'codeblock'],
      ['scrollSync']
    ],
    // Custom renderer for Mermaid diagrams
    customRenderer: {
      codeBlock: function(node, { entering }) {
        if (entering && node.literal && node.literal.trim().startsWith('mermaid')) {
          const code = node.literal.replace(/^mermaid\s*\n/, '');
          const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);

          // Create container for Mermaid diagram
          const container = document.createElement('div');
          container.className = 'mermaid';
          container.id = id;
          container.textContent = code;

          // Render the diagram
          setTimeout(() => {
            mermaid.render(id, code).then(({ svg }) => {
              container.innerHTML = svg;
            }).catch(error => {
              console.error('Mermaid rendering error:', error);
              container.innerHTML = '<p style="color: red;">Error rendering diagram: ' + error.message + '</p>';
            });
          }, 100);

          return container;
        }
        return null; // Use default rendering for non-mermaid code blocks
      }
    }
  });

  // Expose helpers for Python -> JS bridge via runJavaScript
  window._markwrite = {
    setMarkdown: function(md) {
      editor.setMarkdown(md || '');
      // Re-render Mermaid diagrams after content is set
      setTimeout(() => {
        mermaid.init(undefined, '.mermaid');
      }, 200);
    },
    getMarkdown: function() { return editor.getMarkdown(); },
    getHTML: function() { return editor.getHTML(); },
    // New helper for rendering Mermaid diagrams
    renderMermaid: function() {
      mermaid.init(undefined, '.mermaid');
    }
  };

  // Listen for theme changes to update Mermaid theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const theme = e.matches ? 'dark' : 'default';
    mermaid.initialize({ theme: theme });
    // Re-render existing diagrams with new theme
    mermaid.init(undefined, '.mermaid');
  });
</script>
</body>
</html>
"""

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1100, 800)
        self.current_path: Path | None = None
        self._dirty = False
        self._zoom_factor: float = 1.0

        # Central widget
        central = QWidget(self)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        self.view = QWebEngineView(central)
        layout.addWidget(self.view)
        central.setLayout(layout)
        self.setCentralWidget(central)

        # Load the editor HTML
        self._page_loaded: bool = False
        self._pending_md: str | None = None
        self.view.loadFinished.connect(self._on_load_finished)
        self.view.setHtml(HTML_TEMPLATE, baseUrl=QUrl("https://local/"))

        # Menus / actions
        self._build_actions()
        self._build_menus()
        self._connect_shortcuts()
        self._build_toolbar()

        # Track edits (coarse: mark dirty whenever user types: poll)
        # For simplicity we mark dirty on any key input routed to the view.
        self.view.installEventFilter(self)

    # -------- UI setup --------
    def _build_actions(self):
        self.act_new = QAction("&New", self)
        self.act_new.setShortcut(QKeySequence.New)
        self.act_new.triggered.connect(self.file_new)

        self.act_open = QAction("&Open…", self)
        self.act_open.setShortcut(QKeySequence.Open)
        self.act_open.triggered.connect(self.file_open)

        self.act_save = QAction("&Save", self)
        self.act_save.setShortcut(QKeySequence.Save)
        self.act_save.triggered.connect(self.file_save)

        self.act_save_as = QAction("Save &As…", self)
        self.act_save_as.setShortcut(QKeySequence("Ctrl+Shift+S"))
        self.act_save_as.triggered.connect(self.file_save_as)

        self.act_export_html = QAction("Export as &HTML…", self)
        self.act_export_html.triggered.connect(self.export_html)

        self.act_quit = QAction("&Quit", self)
        self.act_quit.setShortcut(QKeySequence.Quit)
        self.act_quit.triggered.connect(self.close)

        self.act_about = QAction("&About", self)
        self.act_about.triggered.connect(self.show_about)

        # Zoom actions
        self.act_zoom_in = QAction("Zoom &In", self)
        self.act_zoom_in.setShortcut(QKeySequence.ZoomIn)
        self.act_zoom_in.triggered.connect(self.view_zoom_in)

        self.act_zoom_out = QAction("Zoom &Out", self)
        self.act_zoom_out.setShortcut(QKeySequence.ZoomOut)
        self.act_zoom_out.triggered.connect(self.view_zoom_out)

        self.act_zoom_reset = QAction("&Actual Size", self)
        self.act_zoom_reset.setShortcut(QKeySequence("Ctrl+0"))
        self.act_zoom_reset.triggered.connect(self.view_zoom_reset)

        # Edit actions
        self.act_undo = QAction("&Undo", self)
        self.act_undo.setShortcut(QKeySequence.Undo)
        self.act_undo.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.Undo))

        self.act_redo = QAction("&Redo", self)
        self.act_redo.setShortcut(QKeySequence.Redo)
        self.act_redo.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.Redo))

        self.act_cut = QAction("Cu&t", self)
        self.act_cut.setShortcut(QKeySequence.Cut)
        self.act_cut.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.Cut))

        self.act_copy = QAction("&Copy", self)
        self.act_copy.setShortcut(QKeySequence.Copy)
        self.act_copy.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.Copy))

        self.act_paste = QAction("&Paste", self)
        self.act_paste.setShortcut(QKeySequence.Paste)
        self.act_paste.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.Paste))

        self.act_select_all = QAction("Select &All", self)
        self.act_select_all.setShortcut(QKeySequence.SelectAll)
        self.act_select_all.triggered.connect(lambda: self.view.triggerPageAction(QWebEnginePage.SelectAll))

    def _build_menus(self):
        file_menu = self.menuBar().addMenu("&File")
        file_menu.addAction(self.act_new)
        file_menu.addAction(self.act_open)
        file_menu.addSeparator()
        file_menu.addAction(self.act_save)
        file_menu.addAction(self.act_save_as)
        file_menu.addSeparator()
        file_menu.addAction(self.act_export_html)
        file_menu.addSeparator()
        file_menu.addAction(self.act_quit)

        view_menu = self.menuBar().addMenu("&View")
        view_menu.addAction(self.act_zoom_in)
        view_menu.addAction(self.act_zoom_out)
        view_menu.addAction(self.act_zoom_reset)

        help_menu = self.menuBar().addMenu("&Help")
        help_menu.addAction(self.act_about)

        edit_menu = self.menuBar().addMenu("&Edit")
        edit_menu.addAction(self.act_undo)
        edit_menu.addAction(self.act_redo)
        edit_menu.addSeparator()
        edit_menu.addAction(self.act_cut)
        edit_menu.addAction(self.act_copy)
        edit_menu.addAction(self.act_paste)
        edit_menu.addSeparator()
        edit_menu.addAction(self.act_select_all)

    def _build_toolbar(self):
        toolbar = QToolBar("Main Toolbar", self)
        toolbar.setMovable(False)
        icon_open = self.style().standardIcon(QStyle.StandardPixmap.SP_DialogOpenButton)
        icon_save = self.style().standardIcon(QStyle.StandardPixmap.SP_DialogSaveButton)
        self.act_open.setIcon(icon_open)
        self.act_save.setIcon(icon_save)
        self.act_save_as.setIcon(icon_save)
        toolbar.addAction(self.act_open)
        toolbar.addAction(self.act_save)
        toolbar.addAction(self.act_save_as)
        toolbar.addSeparator()
        toolbar.addAction(self.act_zoom_in)
        toolbar.addAction(self.act_zoom_out)
        toolbar.addAction(self.act_zoom_reset)
        self.addToolBar(toolbar)

    def show_about(self):
        """Display a simple About dialog for the application."""
        QMessageBox.about(
            self,
            f"About {APP_NAME}",
            (
                f"{APP_NAME} — v{APP_VERSION_FULL}\n\n"
                "A minimal Markdown editor using Qt WebEngine and Toast UI Editor.\n\n"
                "Base implementation performed in Cursor with gpt-5-high,\n"
                "based on idea and requirements by Richie Eiger.\n\n"
                "Keyboard shortcuts:\n"
                "- New: Cmd+N\n- Open: Cmd+O\n- Save: Cmd+S\n- Save As: Cmd+Shift+S\n"
            ),
        )

    def _connect_shortcuts(self):
        # Extra typical bindings
        self.addAction(self.act_save)
        self.addAction(self.act_open)

    # -------- Dirty tracking --------
    def eventFilter(self, obj, event):
        # Mark document potentially dirty on key input in the editor
        from PySide6.QtCore import QEvent
        if obj is self.view and event.type() in (QEvent.KeyPress, QEvent.InputMethod):
            self._dirty = True
            self._sync_title()
        return super().eventFilter(obj, event)

    def event(self, event):
        # Robustly handle macOS Finder "Open With" events at the window level
        if event.type() == QEvent.FileOpen:
            try:
                path = Path(event.file())
                if path.exists():
                    if self._dirty and not self._confirm_discard_changes():
                        return True
                    self._open_path(path)
                    return True
            except Exception:
                return True
        return super().event(event)

    def _sync_title(self):
        name = self.current_path.name if self.current_path else "Untitled"
        if self._dirty:
            name += " •"
        self.setWindowTitle(f"{name} — {APP_NAME}")

    # -------- Zoom controls --------
    def _apply_zoom(self):
        # Clamp zoom factor to a reasonable range
        self._zoom_factor = max(0.5, min(3.0, self._zoom_factor))
        self.view.setZoomFactor(self._zoom_factor)

    def view_zoom_in(self):
        self._zoom_factor += 0.1
        self._apply_zoom()

    def view_zoom_out(self):
        self._zoom_factor -= 0.1
        self._apply_zoom()

    def view_zoom_reset(self):
        self._zoom_factor = 1.0
        self._apply_zoom()

    # -------- File ops --------
    def _open_path(self, path: Path):
        try:
            md = path.read_text(encoding="utf-8")
        except Exception as e:
            QMessageBox.critical(self, "Open failed", f"Could not open:\n{e}")
            return
        self.current_path = path
        self._set_markdown(md)
        self._dirty = False
        self._sync_title()
    def file_new(self):
        if not self._confirm_discard_changes():
            return
        self.current_path = None
        self._dirty = False
        self._set_markdown("")
        self._sync_title()

    def file_open(self):
        if not self._confirm_discard_changes():
            return
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Markdown", str(Path.home()), "Markdown (*.md *.markdown);;All files (*)"
        )
        if not path:
            return
        p = Path(path)
        try:
            md = p.read_text(encoding="utf-8")
        except Exception as e:
            QMessageBox.critical(self, "Open failed", f"Could not open:\n{e}")
            return
        self.current_path = p
        self._set_markdown(md)
        self._dirty = False
        self._sync_title()

    def file_save(self):
        if self.current_path is None:
            return self.file_save_as()
        self._get_markdown_and_write(self.current_path)

    def file_save_as(self):
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Markdown",
            str(self.current_path or Path.home() / "Untitled.md"),
            "Markdown (*.md *.markdown);;All files (*)",
        )
        if not path:
            return
        self.current_path = Path(path)
        self._get_markdown_and_write(self.current_path)

    def export_html(self):
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export HTML",
            str((self.current_path or Path.home() / "Untitled").with_suffix(".html")),
            "HTML (*.html);;All files (*)",
        )
        if not path:
            return
        out = Path(path)
        self._get_html_and_write(out)

    def closeEvent(self, e):
        if self._confirm_discard_changes():
            e.accept()
        else:
            e.ignore()

    def _confirm_discard_changes(self):
        if not self._dirty:
            return True
        r = QMessageBox.question(
            self,
            "Unsaved changes",
            "You have unsaved changes. Save before continuing?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Yes,
        )
        if r == QMessageBox.StandardButton.Cancel:
            return False
        if r == QMessageBox.StandardButton.Yes:
            self.file_save()
            # If still dirty, abort
            return not self._dirty
        return True

    # -------- JS bridge helpers --------
    def _set_markdown(self, text: str):
        # If the page is not ready yet, queue markdown to apply after load
        if not self._page_loaded:
            self._pending_md = text
            return
        js = f"window._markwrite.setMarkdown({_js_str(text)});"
        self.view.page().runJavaScript(js)

    def _on_load_finished(self, ok: bool):
        self._page_loaded = bool(ok)
        if self._page_loaded and self._pending_md is not None:
            md = self._pending_md
            self._pending_md = None
            self._set_markdown(md)

    def _get_markdown_and_write(self, path: Path):
        self.view.page().runJavaScript("window._markwrite.getMarkdown();", self._write_markdown_cb(path))

    def _get_html_and_write(self, path: Path):
        self.view.page().runJavaScript("window._markwrite.getHTML();", self._write_html_cb(path))

    def _write_markdown_cb(self, path: Path):
        def _cb(md):
            try:
                path.write_text(md or "", encoding="utf-8")
                self._dirty = False
                self._sync_title()
            except Exception as e:
                QMessageBox.critical(self, "Save failed", f"Could not save:\n{e}")
        return _cb

    def _write_html_cb(self, path: Path):
        def _cb(html):
            try:
                path.write_text(html or "", encoding="utf-8")
            except Exception as e:
                QMessageBox.critical(self, "Export failed", f"Could not export:\n{e}")
        return _cb


def _js_str(py_str: str) -> str:
    """Safely embed a Python string into JS single-quoted string literal."""
    # Escape backslashes and quotes; also newlines
    s = py_str.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r")
    return f"'{s}'"

class MarkWriteApp(QApplication):
    fileOpened = Signal(str)

    def event(self, e):
        if e.type() == QEvent.FileOpen:
            try:
                self.fileOpened.emit(e.file())
                return True
            except Exception:
                return True
        return super().event(e)


def main():
    # Lightweight CLI flags that avoid launching the GUI when not needed
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("path", nargs="?")
    parser.add_argument("--version", "-v", action="store_true")
    args, _unknown = parser.parse_known_args()

    if args.version:
        print(f"{APP_NAME} {APP_VERSION_FULL}")
        return 0

    os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")
    os.environ.setdefault("QT_SCALE_FACTOR", "1")

    app = MarkWriteApp(sys.argv)
    app.setApplicationName(APP_NAME)

    win = MainWindow()

    # When Finder sends FileOpen to the application (Open With), forward to window
    def _on_app_file_opened(path_str: str):
        p = Path(path_str)
        if p.exists():
            if win._dirty and not win._confirm_discard_changes():
                return
            win._open_path(p)

    app.fileOpened.connect(_on_app_file_opened)
    win.show()

    # If launched with a file path (file association / double-click), open it
    if args.path:
        candidate = Path(args.path)
        if candidate.exists():
            win._open_path(candidate)


    sys.exit(app.exec())

if __name__ == "__main__":
    main()
