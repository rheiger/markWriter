# MarkWriter v2.0 Development Environment Setup Guide

**Version**: 1.0  
**Date**: August 26, 2025  
**Target**: Rust + Tauri + React Development Stack

## Overview

This guide provides comprehensive setup instructions for the MarkWriter v2.0 development environment, covering the complete Rust + Tauri + React toolchain across macOS, Windows, and Linux platforms.

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **Memory**: 8GB RAM (16GB recommended for comfortable development)
- **Storage**: 10GB free space for toolchain and dependencies
- **OS Versions**:
  - macOS 10.15+ (Catalina or newer)
  - Windows 10 version 1903+ or Windows 11
  - Ubuntu 18.04+, Debian 10+, or equivalent Linux distribution

**Development Tools:**
- Git 2.30+
- Node.js 18+ LTS
- Code editor (VS Code recommended, see IDE setup below)

### Platform-Specific Prerequisites

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required system dependencies
brew install cmake pkg-config
```

#### Windows
```powershell
# Install chocolatey (if not already installed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Visual Studio Build Tools
choco install visualstudio2022buildtools --params "--add Microsoft.VisualStudio.Workload.VCTools"

# Install additional dependencies
choco install cmake pkgconfiglite
```

#### Linux (Ubuntu/Debian)
```bash
# Update package lists
sudo apt update

# Install build essentials and dependencies
sudo apt install -y build-essential cmake pkg-config libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev

# Additional dependencies for some distributions
sudo apt install -y libsoup2.4-dev libjavascriptcoregtk-4.0-dev
```

## Rust Development Setup

### Install Rust and Cargo

```bash
# Install rustup (Rust toolchain installer)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Source the cargo environment
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version

# Install stable toolchain (if not default)
rustup install stable
rustup default stable

# Add useful components
rustup component add rustfmt clippy rust-analyzer
```

### Rust Development Tools

```bash
# Install additional development tools
cargo install cargo-watch      # Auto-rebuild on file changes
cargo install cargo-edit       # Cargo dependency management helpers
cargo install cargo-audit      # Security audit tool
cargo install cargo-outdated   # Check for outdated dependencies
cargo install cargo-expand     # Macro expansion tool
cargo install sqlx-cli         # Database management for SQLx

# Install Tauri CLI (latest version)
cargo install tauri-cli --version "^2.0.0"

# Verify Tauri installation
cargo tauri --version
```

### Configure Cargo

Create or edit `~/.cargo/config.toml`:

```toml
[build]
# Use parallel compilation
jobs = 4  # Adjust based on your CPU cores

[registry]
# Use sparse registry for faster dependency resolution (Rust 1.68+)
default = "sparse+https://index.crates.io/"

# Platform-specific configurations
[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-Wl,-rpath,@loader_path"]

[target.x86_64-pc-windows-msvc]
rustflags = ["-C", "target-feature=+crt-static"]

[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "link-arg=-Wl,-rpath,$ORIGIN"]

# Development profile optimizations
[profile.dev]
debug = 1           # Reduce debug info for faster compilation
incremental = true  # Enable incremental compilation

[profile.dev.package."*"]
opt-level = 1       # Optimize dependencies for better dev performance

# Release profile for production builds
[profile.release]
codegen-units = 1   # Single codegen unit for better optimization
lto = true          # Link-time optimization
panic = "abort"     # Smaller binary size
strip = true        # Strip symbols from binary
```

## Node.js and Frontend Setup

### Install Node.js and Package Managers

```bash
# Install Node.js LTS (using Node Version Manager recommended)
# macOS/Linux:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# Windows (using Chocolatey):
choco install nodejs-lts

# Verify installation
node --version  # Should be 18.x or 20.x LTS
npm --version

# Install pnpm (recommended package manager for better performance)
npm install -g pnpm

# Install yarn as alternative (optional)
npm install -g yarn

# Verify package managers
pnpm --version
yarn --version
```

### Frontend Development Tools

```bash
# Install global development tools
pnpm add -g @tauri-apps/cli typescript ts-node
pnpm add -g @vitejs/create-vite eslint prettier

# Install React development tools (globally for convenience)
pnpm add -g create-react-app @types/react @types/react-dom

# Install useful development utilities
pnpm add -g concurrently nodemon serve http-server
```

## IDE and Editor Configuration

### Visual Studio Code Setup

**Install VS Code Extensions:**

```bash
# Essential Rust extensions
code --install-extension rust-lang.rust-analyzer
code --install-extension vadimcn.vscode-lldb
code --install-extension serayuzgur.crates

# Tauri-specific extensions
code --install-extension tauri-apps.tauri-vscode
code --install-extension bradlc.vscode-tailwindcss

# React and TypeScript extensions
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-eslint
code --install-extension esbenp.prettier-vscode

# Useful general extensions
code --install-extension ms-vscode.vscode-json
code --install-extension redhat.vscode-yaml
code --install-extension ms-vscode.vscode-sql
code --install-extension github.copilot  # AI assistance (optional)
```

**VS Code Settings** (`.vscode/settings.json`):

```json
{
  "rust-analyzer.checkOnSave.command": "clippy",
  "rust-analyzer.cargo.features": "all",
  "rust-analyzer.procMacro.enable": true,
  "rust-analyzer.diagnostics.enableExperimental": true,
  
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": true,
    "source.organizeImports": true
  },
  
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.updateImportsOnFileMove.enabled": "always",
  
  "eslint.workingDirectories": ["frontend"],
  "prettier.configPath": "./frontend/.prettierrc",
  
  "files.associations": {
    "*.md": "markdown",
    "*.toml": "toml",
    "*.sql": "sql"
  },
  
  "terminal.integrated.env.osx": {
    "PATH": "/opt/homebrew/bin:/usr/local/bin:${env:PATH}"
  }
}
```

**VS Code Launch Configuration** (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Tauri Development Debug",
      "type": "lldb",
      "request": "launch",
      "program": "${workspaceFolder}/src-tauri/target/debug/markwriter",
      "args": [],
      "cwd": "${workspaceFolder}",
      "sourceLanguages": ["rust"]
    },
    {
      "name": "Tauri Development (cargo tauri dev)",
      "type": "node",
      "request": "launch",
      "program": "cargo",
      "args": ["tauri", "dev"],
      "cwd": "${workspaceFolder}/src-tauri",
      "console": "integratedTerminal"
    }
  ]
}
```

## Database Setup

### SQLx Database Migration

```bash
# Navigate to the Tauri directory
cd src-tauri

# Create migrations directory
mkdir -p migrations

# Create initial migration
sqlx migrate add initial_schema

# Database URL for development
export DATABASE_URL="sqlite:./data/markwriter.db"

# Create the database directory
mkdir -p data

# Run migrations
sqlx migrate run
```

## Development Workflow Setup

### Git Configuration

```bash
# Set up git hooks directory
mkdir -p .githooks

# Create pre-commit hook
cat << 'EOF' > .githooks/pre-commit
#!/bin/sh
# Pre-commit hook for MarkWriter v2

echo "Running pre-commit checks..."

# Check Rust formatting
echo "Checking Rust code formatting..."
cd src-tauri
if ! cargo fmt --check; then
    echo "❌ Rust code is not formatted. Run 'cargo fmt' to fix."
    exit 1
fi

# Run Clippy
echo "Running Clippy..."
if ! cargo clippy -- -D warnings; then
    echo "❌ Clippy found issues. Please fix them."
    exit 1
fi

# Check TypeScript/React formatting
echo "Checking frontend code formatting..."
cd ../frontend
if ! npm run lint; then
    echo "❌ Frontend linting failed. Run 'npm run lint --fix' to fix."
    exit 1
fi

echo "✅ All pre-commit checks passed!"
EOF

chmod +x .githooks/pre-commit

# Configure git to use the hooks directory
git config core.hooksPath .githooks
```

### Development Scripts

**Create scripts directory and make files executable:**

```bash
mkdir -p scripts

# Create development script
cat << 'EOF' > scripts/dev.sh
#!/bin/bash
set -e

echo "🚀 Starting MarkWriter v2 Development Environment"

# Check if all tools are installed
command -v cargo >/dev/null 2>&1 || { echo "❌ Cargo not found. Please install Rust."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Please install Node.js."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm not found. Please install pnpm."; exit 1; }

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && pnpm install && cd ..
fi

# Run database migrations
echo "🗄️  Running database migrations..."
cd src-tauri
export DATABASE_URL="sqlite:./data/markwriter.db"
mkdir -p data
sqlx migrate run || echo "⚠️  No migrations found or already applied"
cd ..

# Start development servers
echo "🔥 Starting development servers..."
pnpm run dev
EOF

# Create build script
cat << 'EOF' > scripts/build.sh
#!/bin/bash
set -e

echo "🏗️  Building MarkWriter v2 for Production"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf frontend/dist
rm -rf src-tauri/target/release

# Install dependencies
echo "📦 Installing dependencies..."
cd frontend && pnpm install && cd ..

# Build frontend
echo "⚛️  Building React frontend..."
cd frontend && pnpm run build && cd ..

# Build Tauri application
echo "🦀 Building Rust application..."
cd src-tauri && cargo tauri build && cd ..

echo "✅ Build completed successfully!"
echo "📦 Binaries available in src-tauri/target/release/bundle/"
EOF

# Create test script
cat << 'EOF' > scripts/test.sh
#!/bin/bash
set -e

echo "🧪 Running MarkWriter v2 Test Suite"

# Run Rust tests
echo "🦀 Running Rust tests..."
cd src-tauri
cargo test --all-features
cd ..

# Run frontend tests
echo "⚛️  Running frontend tests..."
cd frontend
pnpm run test
cd ..

echo "✅ All tests passed!"
EOF

# Create environment verification script
cat << 'EOF' > scripts/verify-env.sh
#!/bin/bash

echo "🔍 Verifying MarkWriter v2 Development Environment"

# Function to check command and version
check_tool() {
    local tool=$1
    local version_arg=$2
    local expected_pattern=$3
    
    if command -v "$tool" >/dev/null 2>&1; then
        local version_output
        version_output=$($tool $version_arg 2>&1)
        echo "✅ $tool: $version_output"
        
        if [ -n "$expected_pattern" ] && ! echo "$version_output" | grep -qE "$expected_pattern"; then
            echo "⚠️  Warning: $tool version might not be optimal"
        fi
    else
        echo "❌ $tool: Not found"
        return 1
    fi
}

# Check core tools
echo "📋 Checking core development tools..."
check_tool "git" "--version" "git version"
check_tool "node" "--version" "v(18|20|21)"
check_tool "npm" "--version" "[0-9]+"
check_tool "pnpm" "--version" "[0-9]+"

# Check Rust toolchain
echo "📋 Checking Rust toolchain..."
check_tool "rustc" "--version" "rustc.*stable"
check_tool "cargo" "--version" "cargo.*"
check_tool "cargo-tauri" "--version" "tauri-cli"

# Check additional tools
echo "📋 Checking additional tools..."
check_tool "sqlx" "--version" "sqlx-cli"

# Check platform-specific tools
case "$(uname -s)" in
    Darwin*)
        echo "📋 Checking macOS-specific tools..."
        check_tool "brew" "--version" "Homebrew"
        ;;
    Linux*)
        echo "📋 Checking Linux-specific tools..."
        check_tool "pkg-config" "--version" "[0-9]+"
        ;;
    CYGWIN*|MINGW32*|MSYS*|MINGW*)
        echo "📋 Checking Windows-specific tools..."
        check_tool "choco" "--version" "[0-9]+"
        ;;
esac

# Test project setup
echo "📋 Checking project setup..."
if [ -f "src-tauri/Cargo.toml" ]; then
    echo "✅ Tauri project structure found"
else
    echo "❌ Tauri project structure not found"
fi

if [ -f "frontend/package.json" ]; then
    echo "✅ Frontend project structure found"
else
    echo "❌ Frontend project structure not found"
fi

if [ -d "src-tauri/migrations" ]; then
    echo "✅ Database migrations directory found"
else
    echo "⚠️  Database migrations directory not found"
fi

echo "🎉 Environment verification complete!"
echo "Run './scripts/dev.sh' to start development"
EOF

# Make all scripts executable
chmod +x scripts/*.sh
```

## Migration Plan from Python Codebase

### Migration Strategy Document

**Create the migration plan:**

```bash
mkdir -p docs/migration
```

**`docs/migration/MigrationPlan.md`**:

```markdown
# Migration Plan: Python → Rust+Tauri+React

## Migration Phases

### Phase 1: Foundation Setup (2-3 weeks)
- [x] Development environment setup
- [x] Architecture design
- [x] API specification
- [ ] Basic Tauri project structure
- [ ] React frontend scaffold
- [ ] Database schema implementation
- [ ] Core build pipeline

### Phase 2: Core Functionality (4-6 weeks)
- [ ] File operations (open, save, export)
- [ ] Toast UI Editor integration
- [ ] Basic settings management
- [ ] Menu system implementation
- [ ] Window management
- [ ] Cross-platform compatibility testing

### Phase 3: Advanced Features (3-4 weeks)
- [ ] Plugin system foundation
- [ ] Embedded diagram support (Mermaid)
- [ ] Multi-window/tabs support
- [ ] Search functionality
- [ ] Backup and recovery system

### Phase 4: Migration and Testing (2-3 weeks)
- [ ] Data migration utilities
- [ ] Settings migration
- [ ] User acceptance testing
- [ ] Performance optimization
- [ ] Documentation updates

## Data Migration Requirements

### Settings Migration
```python
# Python settings structure (current)
{
    "window_geometry": {...},
    "recent_files": [...],
    "editor_preferences": {...}
}
```

```json
// New settings structure (v2.0)
{
    "ui": {
        "windowGeometry": {...},
        "theme": "system"
    },
    "files": {
        "recentDocuments": [...]
    },
    "editor": {
        "defaultMode": "wysiwyg",
        ...
    }
}
```

### File Format Compatibility
- **Markdown files**: Direct compatibility (no migration needed)
- **Settings files**: Require conversion utility
- **Recent files**: Path normalization required
- **Backup files**: Format change required

## Risk Mitigation

### Parallel Development
- Maintain Python version for stability
- Gradual feature migration
- User opt-in for v2.0 testing

### Rollback Strategy
- Keep Python version available
- Export/import utilities for settings
- Clear migration documentation

### User Communication
- Migration guide documentation
- Feature comparison matrix
- Beta testing program
```

### Migration Utilities

**Create migration utilities directory:**

```bash
mkdir -p src-tauri/src/migration
```

**Basic migration structure** (`src-tauri/src/migration/mod.rs`):

```rust
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MigrationError {
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Invalid format: {0}")]
    InvalidFormat(String),
    #[error("Version not supported: {0}")]
    UnsupportedVersion(String),
}

pub struct MigrationManager {
    python_data_dir: PathBuf,
    v2_data_dir: PathBuf,
}

impl MigrationManager {
    pub fn new(python_data_dir: PathBuf, v2_data_dir: PathBuf) -> Self {
        Self {
            python_data_dir,
            v2_data_dir,
        }
    }
    
    pub async fn detect_python_installation(&self) -> Result<PythonInstallation, MigrationError> {
        // Detect Python version installation and data
        todo!("Implement Python installation detection")
    }
    
    pub async fn migrate_settings(&self) -> Result<(), MigrationError> {
        // Migrate user settings from Python version
        todo!("Implement settings migration")
    }
    
    pub async fn migrate_recent_files(&self) -> Result<Vec<PathBuf>, MigrationError> {
        // Migrate recent files list
        todo!("Implement recent files migration")
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonInstallation {
    pub version: String,
    pub data_directory: PathBuf,
    pub settings_file: Option<PathBuf>,
    pub recent_files: Vec<PathBuf>,
}
```

## Troubleshooting Guide

### Common Setup Issues

#### 1. Rust Toolchain Issues

**Problem**: `rustc` or `cargo` command not found after installation
```bash
# Solution: Source the cargo environment
source $HOME/.cargo/env

# Or add to shell profile permanently
echo 'source $HOME/.cargo/env' >> ~/.bashrc  # or ~/.zshrc
```

**Problem**: Compilation errors related to system libraries
```bash
# macOS: Install Xcode command line tools
xcode-select --install

# Linux: Install development packages
sudo apt install build-essential pkg-config libssl-dev

# Windows: Ensure Visual Studio Build Tools are installed
```

#### 2. Node.js and Frontend Issues

**Problem**: Node.js version conflicts
```bash
# Use Node Version Manager to switch versions
nvm install 18
nvm use 18
nvm alias default 18
```

**Problem**: Package installation failures
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Or use pnpm for better dependency resolution
pnpm install
```

#### 3. Tauri-Specific Issues

**Problem**: Tauri dev server fails to start
```bash
# Check Tauri configuration
cargo tauri info

# Verify frontend build
cd frontend && npm run build

# Check port conflicts
lsof -i :5173  # Default Vite port
```

**Problem**: WebView not loading in development
```bash
# Check CSP configuration in tauri.conf.json
# Verify allowlist permissions
# Check browser console for errors (Ctrl+Shift+I in Tauri window)
```

#### 4. Database Issues

**Problem**: SQLx compilation errors
```bash
# Generate offline query metadata
cargo sqlx prepare

# Or use runtime checking for development
export SQLX_OFFLINE=false

# Check database URL
export DATABASE_URL="sqlite:./data/markwriter.db"
```

**Problem**: Migration failures
```bash
# Reset database and re-run migrations
rm -f data/markwriter.db
sqlx migrate run
```

### Performance Optimization

#### Rust Compilation Speed

```toml
# Add to ~/.cargo/config.toml
[build]
rustflags = ["-C", "target-cpu=native"]

# Use faster linker
[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=lld"]

[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "link-arg=-fuse-ld=lld"]
```

#### Frontend Build Speed

```javascript
// vite.config.ts optimizations
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false, // Disable for faster builds
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
```

### Environment-Specific Notes

#### macOS Development

```bash
# Ensure Homebrew paths are correctly set
eval "$(/opt/homebrew/bin/brew shellenv)"

# For Intel Macs, use /usr/local/bin/brew

# Install additional tools
brew install llvm pkg-config
```

#### Windows Development

```powershell
# Set up Windows development environment
# Install Windows SDK if needed
winget install Microsoft.WindowsSDK

# Set environment variables
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
```

#### Linux Development

```bash
# Install distribution-specific packages
# Ubuntu/Debian:
sudo apt install libwebkit2gtk-4.0-dev libgtk-3-dev libappindicator3-dev

# Fedora:
sudo dnf install webkit2gtk3-devel gtk3-devel libappindicator-gtk3-devel

# Arch Linux:
sudo pacman -S webkit2gtk gtk3 libappindicator-gtk3
```

## Next Steps

Once your development environment is set up:

1. **Run environment verification**: `./scripts/verify-env.sh`
2. **Start development server**: `./scripts/dev.sh`
3. **Begin with Phase 1 implementation**: Core Tauri setup and React integration
4. **Follow the migration plan**: Systematic progression through architecture phases
5. **Join development**: Coordinate with the team on Issue #13 progress

## Resources and References

### Documentation Links
- [Tauri Documentation](https://tauri.app/)
- [Rust Programming Language](https://doc.rust-lang.org/book/)
- [React Documentation](https://react.dev/)
- [SQLx Documentation](https://docs.rs/sqlx/)
- [Vite Documentation](https://vitejs.dev/)

### Community Resources
- [Tauri Discord](https://discord.com/invite/SpmNs4S)
- [Rust Community](https://www.rust-lang.org/community)
- [React Community](https://react.dev/community)

### Development Tools
- [Visual Studio Code](https://code.visualstudio.com/)
- [Rust Analyzer](https://rust-analyzer.github.io/)
- [React Developer Tools](https://react.dev/learn/react-developer-tools)

---

This development environment setup provides a solid foundation for MarkWriter v2.0 development. The configuration balances development speed, code quality, and cross-platform compatibility while establishing clear patterns for the team to follow.