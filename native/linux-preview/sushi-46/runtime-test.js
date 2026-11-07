/* Run only against an isolated Sushi 46 installation under Xvfb. */
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.GtkSource = '4';
imports.gi.versions.Sushi = '1.0';
imports.gi.versions.EvinceDocument = '3.0';
imports.gi.versions.EvinceView = '3.0';
imports.gi.versions.Gst = '1.0';
imports.gi.versions.GstTag = '1.0';
imports.gi.versions.Soup = '3.0';
const {Gio, GLib, Gtk} = imports.gi;
Gtk.init(null);
var pkg = {pkgdatadir: '/usr/share/sushi'};
const resource = Gio.Resource.load('/usr/share/sushi/org.gnome.NautilusPreviewer.src.gresource');
Gio.resources_register(resource);
imports.searchPath.unshift('resource:///org/gnome/NautilusPreviewer/js');
const handler = imports.ui.mimeHandler;
const viewer = imports.viewers.markwriterMarkdown;
if (handler.getKlass('text/markdown') !== viewer.Klass)
    throw new Error('Markdown renderer was not selected by Sushi');
if (handler.getKlass('text/plain') === viewer.Klass)
    throw new Error('Plain text renderer was replaced');
const dir = GLib.dir_make_tmp('markwriter-sushi-XXXXXX');
const path = GLib.build_filenamev([dir, 'sample.md']);
GLib.file_set_contents(path, '# Heading\n\nText\n```\ncode\n```\n');
const file = Gio.File.new_for_path(path);
const info = file.query_info('standard::type,standard::size', Gio.FileQueryInfoFlags.NONE, null);
const widget = new viewer.Klass(file, info);
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
loop.run();
const buffer = widget.get_child().get_buffer();
const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
if (!text.includes('Heading') || !text.includes('code') || text.includes('unavailable'))
    throw new Error('Markdown was not displayed: ' + text);
if (!buffer.get_start_iter().get_tags().some(tag => tag.name === 'heading' && tag.weight === 700))
    throw new Error('Heading text is missing its bold formatting tag');
widget.destroy();
GLib.file_set_contents(path, 'x'.repeat(256 * 1024 + 1));
const bigInfo = file.query_info('standard::type,standard::size', Gio.FileQueryInfoFlags.NONE, null);
const bigWidget = new viewer.Klass(file, bigInfo);
const bigBuffer = bigWidget.get_child().get_buffer();
const errorText = bigBuffer.get_text(bigBuffer.get_start_iter(), bigBuffer.get_end_iter(), false);
if (!errorText.includes('up to 256 KiB')) throw new Error('Oversized file was not rejected');
bigWidget.destroy();
file.delete(null);
Gio.File.new_for_path(dir).delete(null);
print('Sushi 46 dispatch and renderer smoke test passed');
