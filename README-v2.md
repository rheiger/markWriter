# MarkWriter v2.0 Development Branch

🚀 **Modern Rust + Tauri + React Architecture**  
⚠️ **Alpha Development Version** - Not for production use

This branch contains the complete architectural rewrite of MarkWriter using modern technologies for improved performance, security, and extensibility.

## 🏗️ Architecture Overview

### **Technology Stack**
- **Backend**: Rust with Tauri 2.0 framework
- **Frontend**: React 18+ with TypeScript
- **State Management**: Zustand
- **Build System**: Vite with esbuild
- **Styling**: Tailwind CSS (planned)
- **Editor**: Toast UI Editor integration

### **Key Benefits**
- **10-35x smaller bundles** (vs Electron alternatives)
- **2x faster startup time** (vs current Python version)
- **Memory-safe backend** with Rust
- **Enhanced security** through process isolation
- **Plugin system** architecture
- **Cross-platform native integration**

## 📁 Project Structure

```
markWriter/
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs             # Application entry point
│   │   ├── lib.rs              # Library modules
│   │   ├── app.rs              # Tauri app setup
│   │   ├── commands.rs         # Tauri command handlers
│   │   ├── config.rs           # Configuration management
│   │   ├── document.rs         # Document model
│   │   ├── error.rs            # Error handling
│   │   └── events.rs           # Event system
│   ├── assets/                 # Static assets
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri configuration
├── frontend/                   # React frontend
│   ├── src/                   # React source code (to be created)
│   ├── package.json           # Frontend dependencies
│   └── vite.config.ts         # Vite configuration
├── docs/                      # Architecture documentation
│   ├── SystemArchitecture.md
│   ├── ApiSpecification.md
│   ├── StorageSchema.md
│   ├── DevelopmentSetup.md
│   └── ArchitectureSummary.md
├── package.json               # Workspace coordination
└── README.md                  # This file
```

## 🛠️ Development Setup

### **Prerequisites**
- **Rust**: 1.70+ with cargo
- **Node.js**: 18+ LTS
- **System Dependencies**: Platform-specific (see setup guide)

### **Quick Start**

1. **Clone and switch to v2 branch**:
```bash
git checkout v2-development
```

2. **Install dependencies**:
```bash
npm run setup
```

3. **Start development servers**:
```bash
npm run dev
```

This will start both the React frontend (port 5173) and Tauri backend concurrently.

### **Available Scripts**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend in development mode |
| `npm run build` | Build production application |
| `npm run test` | Run all tests (frontend + backend) |
| `npm run lint` | Lint all code (frontend + backend) |
| `npm run format` | Format all code (frontend + backend) |
| `npm run clean` | Clean build artifacts |

## 🏃‍♂️ Current Development Status

### ✅ **Completed (Phase 1: Foundation)**
- [x] **Project Structure**: Complete Rust + React setup
- [x] **Build System**: Vite + Cargo configuration
- [x] **Error Handling**: Comprehensive error types and conversion
- [x] **Configuration**: JSON-based config with platform defaults
- [x] **Document Model**: Full document lifecycle management
- [x] **Tauri Commands**: Core file operations (create, open, save, export)
- [x] **Event System**: Application-wide event handling
- [x] **Development Workflow**: Scripts and toolchain setup

### 🚧 **In Progress (Phase 2: Core Features)**
- [ ] **React Frontend**: Component structure and state management
- [ ] **Toast UI Editor**: Integration with document model
- [ ] **File Dialogs**: Native file operations UI
- [ ] **Menu System**: Cross-platform menu integration
- [ ] **Settings UI**: Configuration management interface

### 📋 **Planned (Phase 3: Advanced Features)**
- [ ] **Plugin System**: Foundation and API implementation
- [ ] **Search Functionality**: Full-text search implementation
- [ ] **Multi-window**: Tabbed interface support
- [ ] **Mermaid Integration**: Embedded diagram support

### 🎯 **Future (Phase 4: Migration & Polish)**
- [ ] **Python Migration**: Data conversion utilities
- [ ] **Performance Optimization**: Profiling and optimization
- [ ] **User Testing**: Beta testing and feedback integration
- [ ] **Documentation**: User guides and API docs

## 🧪 Testing the Current Build

### **Backend Testing**
```bash
cd src-tauri
cargo test
```

### **Frontend Testing** (when frontend is implemented)
```bash
cd frontend
npm test
```

### **Manual Testing**
```bash
# Start development mode
npm run dev

# The Tauri window should open with basic functionality
# File operations should work through Tauri commands
```

## 📚 Documentation

Comprehensive architectural documentation is available in the `docs/` directory:

- **[System Architecture](./docs/SystemArchitecture.md)** - Complete system design overview
- **[API Specification](./docs/ApiSpecification.md)** - Tauri commands and type definitions
- **[Storage Schema](./docs/StorageSchema.md)** - Database and configuration design
- **[Development Setup](./docs/DevelopmentSetup.md)** - Detailed setup instructions
- **[Architecture Summary](./docs/ArchitectureSummary.md)** - Executive overview

## 🐛 Known Issues & Limitations

### **Current Limitations**
- **Frontend Not Complete**: React UI components not yet implemented
- **Database Optional**: SQLite integration available but not required
- **Basic HTML Export**: Simplified markdown conversion (not full featured)
- **No Plugin System**: Architecture designed but not implemented

### **Development Notes**
- **Database Concern**: SQLite usage is being evaluated - can start with file-only approach
- **Tauri 2.0**: Using latest Tauri version for modern features
- **Build Size**: Optimized for small bundle size and fast startup

## 🤝 Contributing to v2 Development

### **Getting Started**
1. Read the [Development Setup Guide](./docs/DevelopmentSetup.md)
2. Review the [System Architecture](./docs/SystemArchitecture.md)
3. Check the [API Specification](./docs/ApiSpecification.md)
4. Follow the development workflow below

### **Development Workflow**
1. **Create feature branch**: `git checkout -b feature/your-feature-name`
2. **Make changes**: Follow Rust and React best practices
3. **Test changes**: `npm run test`
4. **Format code**: `npm run format`
5. **Lint code**: `npm run lint`
6. **Commit**: Use conventional commits
7. **Push and PR**: Target `v2-development` branch

### **Code Standards**
- **Rust**: Use `cargo fmt` and `cargo clippy`
- **TypeScript**: Use ESLint and Prettier
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/)
- **Testing**: Maintain test coverage for new functionality

## 🔄 Relationship to Main Branch

### **Branch Strategy**
- **`main`**: Stable Python version (v0.2.4+)
- **`v2-development`**: Modern Rust+React architecture
- **Parallel Development**: Both versions maintained during transition

### **Migration Timeline**
- **Phase 1-2** (Current): Foundation and core features
- **Phase 3**: Advanced features and plugin system
- **Phase 4**: User migration tools and documentation
- **v2.0.0 Release**: Replace main branch after successful migration

## 📞 Support & Questions

For v2 development questions:
- **Architecture Questions**: Review docs/ directory
- **Setup Issues**: Check [Development Setup Guide](./docs/DevelopmentSetup.md)
- **Bug Reports**: Use GitHub issues with `v2` label
- **Feature Requests**: Use GitHub issues with `v2-enhancement` label

---

**⚠️ Development Warning**: This is an active development branch. The application may be unstable and APIs may change. Use the main branch for production needs.

**🎯 Goal**: Create a modern, performant, and secure Markdown editor that surpasses the current Python version while maintaining all beloved features and adding powerful new capabilities.
