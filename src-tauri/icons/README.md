# Icons Directory

This directory contains the application icons for MarkWriter in various sizes and formats required by different platforms.

## Required Icons

- `32x32.png` - Small icon for taskbar/dock
- `128x128.png` - Medium icon for applications folder  
- `128x128@2x.png` - High-DPI medium icon
- `icon.icns` - macOS application icon bundle
- `icon.ico` - Windows application icon

## Placeholder Icons

Currently using placeholder icons. These should be replaced with proper MarkWriter branding in the future.

## Windows build resource

`icon.ico` is tracked because tauri-build requires it even for Windows tests. It is generated from the existing `icon.png` using the pinned Tauri CLI. Generate to a temporary directory and copy only the ICO to preserve the source PNG.
