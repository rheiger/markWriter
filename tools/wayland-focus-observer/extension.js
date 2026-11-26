import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const interfaceXml = `
<node>
  <interface name="com.markwriter.WaylandTest">
    <method name="Capture">
      <arg type="ay" direction="out"/>
    </method>
    <method name="Pointer">
      <arg type="i" direction="out"/>
      <arg type="i" direction="out"/>
    </method>
  </interface>
</node>`;

export default class FocusObserver extends Extension {
    enable() {
        const path = GLib.build_filenamev([
            GLib.getenv('MARKWRITER_ASSOCIATION_EVIDENCE'),
            'focus.json',
        ]);
        const history = [];
        const record = () => {
            const window = global.display.get_focus_window();
            history.push({
                time: GLib.get_monotonic_time() / 1000000,
                title: window?.get_title(),
                app: window?.get_wm_class(),
                pid: window?.get_pid(),
                wayland: window?.get_client_type() === Meta.WindowClientType.WAYLAND,
            });
            GLib.file_set_contents(path, JSON.stringify(history, null, 2));
        };
        this._focusChanged = global.display.connect('notify::focus-window', record);
        record();

        this._fixture = Gio.DBusExportedObject.wrapJSObject(interfaceXml, {
            Pointer: () => global.get_pointer().slice(0, 2),
            CaptureAsync: async (_parameters, invocation) => {
                try {
                    const output = Gio.MemoryOutputStream.new_resizable();
                    const shooter = new Shell.Screenshot();
                    await shooter.screenshot(true, output);
                    output.close(null);
                    invocation.return_value(new GLib.Variant('(ay)', [output.steal_as_bytes().toArray()]));
                } catch (error) {
                    invocation.return_dbus_error('com.markwriter.WaylandTest.Error', error.message);
                }
            },
        });
        this._fixture.export(Gio.DBus.session, '/com/markwriter/WaylandTest');
    }

    disable() {
        this._fixture.unexport();
        global.display.disconnect(this._focusChanged);
    }
}
