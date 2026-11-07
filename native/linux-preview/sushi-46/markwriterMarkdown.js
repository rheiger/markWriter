/* GNOME Sushi 46 user-local renderer. No document resources are loaded. */
const { Gio, GLib, GObject, Gtk } = imports.gi;
const ByteArray = imports.byteArray;
const Renderer = imports.ui.renderer;
const LIMIT = 256 * 1024;

var mimeTypes = ['text/markdown'];
var Klass = GObject.registerClass({
    Implements: [Renderer.Renderer],
    Properties: {
        fullscreen: GObject.ParamSpec.boolean('fullscreen', '', '', GObject.ParamFlags.READABLE, false),
        ready: GObject.ParamSpec.boolean('ready', '', '', GObject.ParamFlags.READABLE, false),
    },
}, class MarkWriterMarkdownRenderer extends Gtk.ScrolledWindow {
    get fullscreen() { return false; }
    get ready() { return !!this._ready; }
    get moveOnClick() { return false; }

    _init(file, fileInfo) {
        super._init();
        const buffer = new Gtk.TextBuffer();
        const view = new Gtk.TextView({buffer, editable: false, cursor_visible: false,
            wrap_mode: Gtk.WrapMode.WORD_CHAR, left_margin: 20, right_margin: 20,
            top_margin: 20, bottom_margin: 20});
        this.add(view);
        this._buffer = buffer;
        this._cancellable = new Gio.Cancellable();
        this._disposed = false;
        this.connect('destroy', () => { this._disposed = true; this._cancellable.cancel(); });
        this._ready = true;
        this.isReady();
        if (!file.is_native() || fileInfo.get_file_type() !== Gio.FileType.REGULAR ||
            fileInfo.get_size() > LIMIT) {
            this._fail('Only local Markdown files up to 256 KiB can be previewed.');
            return;
        }
        // A timeout also bounds reads if the path is replaced by a pipe after the metadata query.
        let timedOut = false;
        const timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            timedOut = true;
            this._cancellable.cancel();
            this._fail('Preview timed out.');
            return GLib.SOURCE_REMOVE;
        });
        this._load(file).catch(error => { if (!this._cancellable.is_cancelled()) this._fail(error.message); }).finally(() => {
            if (!timedOut) GLib.source_remove(timeout);
        });
    }

    _fail(message) {
        if (!this._disposed && this._buffer) this._buffer.set_text('MarkWriter preview unavailable: ' + message, -1);
    }

    async _load(file) {
        const cancellable = this._cancellable;
        const stream = await new Promise((resolve, reject) => file.read_async(GLib.PRIORITY_DEFAULT, cancellable,
            (obj, result) => { try { resolve(obj.read_finish(result)); } catch (e) { reject(e); } }));
        let chunks = [], length = 0;
        try {
            while (length <= LIMIT) {
                const bytes = await new Promise((resolve, reject) => stream.read_bytes_async(
                    Math.min(8192, LIMIT + 1 - length), GLib.PRIORITY_DEFAULT, cancellable,
                    (obj, result) => { try { resolve(obj.read_bytes_finish(result)); } catch (e) { reject(e); } }));
                if (bytes.get_size() === 0) break;
                const chunk = bytes.get_data();
                chunks.push(chunk); length += chunk.length;
            }
        } finally { stream.close_async(GLib.PRIORITY_DEFAULT, null, null); }
        if (length > LIMIT) throw new Error('File exceeds the preview size limit.');
        let joined = new Uint8Array(length), pos = 0;
        for (const chunk of chunks) { joined.set(chunk, pos); pos += chunk.length; }
        const text = ByteArray.toString(joined);
        if (text.includes('\0')) throw new Error('File is not valid UTF-8 text.');
        if (cancellable.is_cancelled()) return;
        const buffer = this._buffer;
        const heading = buffer.create_tag('heading', {weight: 700, scale: 1.4, pixels_above_lines: 10});
        const code = buffer.create_tag('code', {family: 'monospace'});
        let fenced = false;
        for (const line of text.split('\n').slice(0, 4000)) {
            if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
            let iter = buffer.get_end_iter();
            const match = !fenced && /^(#{1,6})\s+(.+)$/.exec(line);
            const shown = match ? match[2] : line;
            if (match || fenced) buffer.insert_with_tags(iter, shown + '\n', match ? heading : code);
            else buffer.insert(iter, shown + '\n', -1);
        }
    }
});
