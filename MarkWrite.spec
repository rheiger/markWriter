# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['markwrite.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['PySide6.QtWebEngineWidgets'],
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
    [],
    exclude_binaries=True,
    name='MarkWrite',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='MarkWrite',
)
app = BUNDLE(
    coll,
    name='MarkWrite.app',
    icon='assets/MarkWrite.icns',
    bundle_identifier='com.rheiger.markwrite',
    info_plist={
        'CFBundleName': 'MarkWrite',
        'CFBundleDisplayName': 'MarkWrite',
        'CFBundleShortVersionString': '0.1.3',
        'CFBundleVersion': '000022',
        'NSHighResolutionCapable': True,
        'CFBundleDocumentTypes': [
            {
                'CFBundleTypeName': 'Markdown Document',
                'CFBundleTypeRole': 'Editor',
                'LSHandlerRank': 'Default',
                'CFBundleTypeExtensions': ['md', 'markdown', 'mdown', 'mkd', 'mkdown', 'mdtxt'],
            },
        ],
    },
)
