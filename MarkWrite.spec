# -*- mode: python ; coding: utf-8 -*-
# Import PyInstaller classes - handle both old and new versions
try:
    from PyInstaller.building.build_main import Analysis, PYZ, EXE, BUNDLE
except ImportError:
    try:
        from PyInstaller.building.build_main import Analysis, PYZ, EXE
        from PyInstaller.building.osx import BUNDLE
    except ImportError:
        # Fallback: these classes should be available when running through PyInstaller
        pass

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

# Create EXE (required for COLLECT, but won't be written to disk)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='MarkWrite',
)

# Create a collection of all files
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    a.zipfiles,
    name='MarkWrite',
)

# macOS app bundle
app = BUNDLE(
    coll,
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
        'CFBundleShortVersionString': '0.2.4',
        'CFBundleVersion': '000033',
        'NSHighResolutionCapable': True,
    },
)
