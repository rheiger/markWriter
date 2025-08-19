# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['markwrite.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets/css', 'assets/css'),
        ('assets/js', 'assets/js'),
        ('assets/MarkWrite.icns', 'assets'),
        ('assets/MarkWrite.ico', 'assets'),
        ('assets/icon_1024.png', 'assets'),
        ('assets/MarkWrite.iconset', 'assets/MarkWrite.iconset'),
        ('editor_offline.html', '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MarkWrite',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# macOS app bundle
app = APP(
    exe,
    name='MarkWrite',
    icon='assets/MarkWrite.icns',
    bundle_identifier='com.markwrite.app',
    info_plist={
        'CFBundleDocumentTypes': [
            {
                'CFBundleTypeName': 'Markdown Document',
                'CFBundleTypeExtensions': ['md', 'markdown'],
                'CFBundleTypeRole': 'Editor',
                'LSHandlerRank': 'Owner',
            }
        ],
        'CFBundleShortVersionString': '0.2.2',
        'CFBundleVersion': '000031',
        'NSHighResolutionCapable': True,
    },
)
