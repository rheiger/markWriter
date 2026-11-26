import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

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
                wayland: window?.get_client_type() === Meta.WindowClientType.WAYLAND,
            });
            GLib.file_set_contents(path, JSON.stringify(history, null, 2));
        };
        this._focusChanged = global.display.connect('notify::focus-window', record);
        record();
    }

    disable() {
        global.display.disconnect(this._focusChanged);
    }
}
