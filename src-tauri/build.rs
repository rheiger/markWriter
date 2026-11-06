fn main() {
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        // Tauri's resource manifest reaches the app binary, but not the library
        // test harness. Both link rfd's TaskDialogIndirect and need Controls v6.
        // Let MSVC embed the same dependency in every executable instead.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new_without_app_manifest(),
        ))
        .expect("failed to build Windows resources");
    } else {
        tauri_build::build()
    }
}
