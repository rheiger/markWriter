#!/usr/bin/env python3
"""
Test script to verify offline functionality of MarkWrite
"""

import os
import sys
from pathlib import Path

def test_assets_exist():
    """Test if all required assets exist in the build"""
    print("🔍 Testing offline assets...")
    
    # Check if we're in a built app or source
    if getattr(sys, 'frozen', False):
        # Running in built app
        base_path = Path(sys._MEIPASS)
        print(f"✅ Running in built app: {base_path}")
    else:
        # Running from source
        base_path = Path(__file__).parent
        print(f"📁 Running from source: {base_path}")
    
    # Required assets
    required_assets = [
        "assets/css/toastui-editor.min.css",
        "assets/js/toastui-editor-all.min.js", 
        "assets/js/mermaid.min.js"
    ]
    
    missing_assets = []
    
    for asset in required_assets:
        asset_path = base_path / asset
        if asset_path.exists():
            size = asset_path.stat().st_size
            print(f"✅ {asset} ({size:,} bytes)")
        else:
            print(f"❌ {asset} - MISSING")
            missing_assets.append(asset)
    
    if missing_assets:
        print(f"\n❌ Missing {len(missing_assets)} assets:")
        for asset in missing_assets:
            print(f"   - {asset}")
        return False
    else:
        print(f"\n✅ All {len(required_assets)} assets found!")
        return True

def test_html_template():
    """Test if HTML template references local assets"""
    print("\n🔍 Testing HTML template...")
    
    try:
        with open("markwrite.py", "r") as f:
            content = f.read()
        
        # Check for CDN references
        cdn_patterns = [
            "https://uicdn.toast.com",
            "https://cdn.jsdelivr.net"
        ]
        
        cdn_found = []
        for pattern in cdn_patterns:
            if pattern in content:
                cdn_found.append(pattern)
        
        if cdn_found:
            print(f"❌ CDN references found: {cdn_found}")
            return False
        else:
            print("✅ No CDN references found in HTML template")
            
        # Check for local asset references
        local_patterns = [
            "assets/css/toastui-editor.min.css",
            "assets/js/toastui-editor-all.min.js"
        ]
        
        local_found = []
        for pattern in local_patterns:
            if pattern in content:
                local_found.append(pattern)
        
        if local_found:
            print(f"✅ Local asset references found: {len(local_found)}")
            return True
        else:
            print("❌ No local asset references found")
            return False
            
    except FileNotFoundError:
        print("❌ markwrite.py not found")
        return False

def main():
    """Run all tests"""
    print("🧪 MarkWrite Offline Functionality Test")
    print("=" * 50)
    
    assets_ok = test_assets_exist()
    template_ok = test_html_template()
    
    print("\n" + "=" * 50)
    if assets_ok and template_ok:
        print("🎉 OFFLINE FUNCTIONALITY VERIFIED!")
        print("✅ All assets are local")
        print("✅ No CDN dependencies")
        print("✅ App can work without internet")
    else:
        print("❌ OFFLINE FUNCTIONALITY NOT VERIFIED")
        if not assets_ok:
            print("   - Missing local assets")
        if not template_ok:
            print("   - HTML template has issues")
    
    return assets_ok and template_ok

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
