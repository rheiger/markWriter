# AI Agent Guidelines for MarkWriter Project

**Version**: 1.3
**Last Updated**: August 27, 2025
**Target Version**: v0.2.1 → v2.0.0

## Project Overview

MarkWriter is a minimal, cross-platform Markdown editor that has successfully completed its **Phase 2 rewrite from Python+Qt to Rust+Tauri+React AND CodeMirror 6 Migration**. The project is currently at **v2.0.0-alpha.1** with **CodeMirror 6 fully implemented** and ready for **Phase 3 advanced features**.

### Current State ✅ PHASE 2 COMPLETE + CODEMIRROR 6 MIGRATION COMPLETE!
- **Technology Stack**: Rust (Tauri) + React + TypeScript + Zustand + **CodeMirror 6**
- **Platforms**: macOS ✅, Windows ✅, Linux ✅
- **Features**: CodeMirror 6 Markdown editing, file operations, HTML export, theme system
- **Architecture**: Modern desktop app with native performance and web UI flexibility

### Strategic Direction 🎯 PHASE 3 EXECUTION - READY FOR MERMAID!
- **✅ CodeMirror 6 Migration**: **COMPLETE** - Editor fully migrated and integrated
- **🚀 Mermaid Diagrams**: **READY FOR IMPLEMENTATION** - No longer blocked!
- **Advanced Features**: Plugin system, multi-window support, enhanced UX
- **Performance & Polish**: Optimization, cross-platform testing, v2.0.0 release

## Repository Structure & Key Files

```
markWriter/
├── frontend/                # React+TypeScript frontend
│   ├── src/
│   │   ├── components/     # React components (CodeMirror 6 integrated!)
│   │   ├── stores/         # Zustand state management
│   │   └── types/          # TypeScript definitions
│   ├── package.json        # Frontend dependencies (CodeMirror 6)
│   └── vite.config.ts      # Build configuration
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands
│   │   ├── main.rs         # Application entry
│   │   └── models/         # Data structures
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # App configuration
├── README-v2.md            # v2.0 documentation
├── AGENTS.md               # This file
├── FRONTEND_IMPLEMENTATION.md  # Implementation details
└── legacy files/           # Original Python implementation
```

## Issue Tracking & Project Management

### Current Issue Classification

**✅ EPIC COMPLETE**:
- **#3**: Rust+Tauri+React Rewrite - **PHASE 2 COMPLETE**
- **#16**: CodeMirror 6 Migration - **COMPLETE** ✅ (Can be closed!)

**🚀 READY FOR IMMEDIATE IMPLEMENTATION** (Unblocked!)
- **#1**: Embedded Mermaid Diagrams - **READY** (2-3 days implementation)

**🔧 MINOR INTEGRATION POLISH** (Nearly Complete):
- **#17**: Menu Integration Polish - **90% COMPLETE** (final testing needed)

**📋 PHASE 3 READY** (Advanced Features):
- **#10**: Complete Menu System - **Core complete, advanced features ready**
- **#9**: Settings & Preferences System - **Foundation complete, UI needed**
- **#8**: Multiple Windows & Tabs Support - **Architecture ready**
- **#6**: Plugin System Architecture - **Foundation in place**
- **#5**: Draw.io Diagram Support - **Ready after Mermaid**

**🛠️ ENHANCEMENT TRACK**:
- **#7**: Multi-Format Support (JSON/XML)
- **#4**: Linux Platform Support - **May be complete**

### Workflow Best Practices
1. **Focus on Mermaid Implementation**: #1 is now the top priority!
2. **Final Menu Testing**: Complete #17 integration testing
3. **Follow Priorities**: Mermaid diagrams → Advanced features
4. **Document Decisions**: Update relevant docs and architectural decisions

## Technical Guidelines

### Code Quality Standards

**React/TypeScript (Frontend)**:
```typescript
// Follow existing patterns in frontend/src/
// - Use TypeScript strict mode with proper typing
// - Zustand for state management with Tauri integration
// - React 18+ patterns with hooks and function components
// - CodeMirror 6 for editor functionality
// - Tailwind CSS for consistent styling
```

**Rust (Backend)**:
```rust
// Follow existing patterns in src-tauri/src/
// - Use serde for JSON serialization
// - Tauri command patterns for frontend communication
// - Error handling with Result<T, E> patterns
// - Safe async operations with tokio
```

**Architecture Decisions**:
- CodeMirror 6 provides modern editor foundation
- Maintain separation between frontend UI and backend logic
- Use Tauri commands for secure file operations
- Implement proper error handling and user feedback
- Follow cross-platform development best practices

### Testing Strategy
- **Manual Testing**: Cross-platform validation (macOS, Windows, Linux)
- **Integration Testing**: Tauri command functionality
- **Performance Testing**: Startup time, memory usage, large documents
- **User Workflow Testing**: Document creation/editing/export workflows

## Agent Roles & Responsibilities

### 🏗️ **Architecture Agent** (Strategic & Technical Leadership)
**Primary Objectives:**
- **✅ COMPLETED**: CodeMirror 6 migration technical implementation
- **🚀 IMMEDIATE**: Lead Mermaid diagram integration (#1)
- Design plugin system architecture for future extensibility
- Make technology decisions aligned with v2.0.0 goals

**Current Focus:**
- **Mermaid Implementation**: Design and implement diagram rendering system
- **Plugin System Foundation**: Prepare architecture for extensibility
- **Performance Optimization**: Ensure v2.0 performance targets
- **Advanced Feature Planning**: Coordinate Phase 3 development

**Key Deliverables:**
- Mermaid diagram rendering system (mermaid.js integration)
- Plugin architecture specification
- Performance optimization strategy

### 🔧 **Development Agent** (Implementation Focus)
**Primary Objectives:**
- **🚀 IMMEDIATE**: Implement Mermaid diagram functionality
- Most coding and unit testing for Phase 3 features
- Maintain code quality and testing standards

**Current Focus:**
- **Mermaid Integration**: Add mermaid.js to CodeMirror 6 preview
- **React Component Development**: MermaidRenderer component
- **Preview Enhancement**: Diagram parsing and rendering
- **Cross-platform Testing**: Ensure functionality across platforms

**Key Deliverables:**
- MermaidRenderer.tsx component
- Enhanced preview pane with diagram support
- Comprehensive test coverage

### 📋 **Project Management Agent** (GitHub & Process Excellence)
**Primary Objectives:**
- Support contributors managing project and repo aligned with best practices
- **🚀 IMMEDIATE**: Update issue priorities (Mermaid is now unblocked!)
- Ensure GitHub workflow optimization and release planning
- Coordinate Phase 3 feature development

**Current Focus:**
- **Issue Management**: Update #16 (complete), prioritize #1 (Mermaid)
- **Release Planning**: Coordinate v2.0.0-beta timeline
- **Progress Tracking**: Monitor Mermaid implementation progress
- **Documentation Maintenance**: Keep project docs current

**Key Deliverables:**
- Updated GitHub issue priorities and dependencies
- Release milestone planning and coordination
- Progress tracking and status reporting

## Development Priorities (Immediate - Next 2 weeks)

### 🔥 **Critical Path (Next Week)**
**HIGHEST PRIORITY:**

1. **Mermaid Diagrams Implementation** (#1) - **2-3 development days**
   - **Phase 1**: Add mermaid.js dependency and basic integration
   - **Phase 2**: Create MermaidRenderer component for preview pane
   - **Phase 3**: Theme-aware diagram styling and error handling
   - **Phase 4**: Export functionality and testing

2. **Final Menu Integration Testing** (#17) - **1 day**
   - Test all menu operations with CodeMirror 6
   - Verify keyboard shortcuts work correctly
   - Cross-platform functionality validation

### 🚀 **Phase 3 Advanced Features (Parallel Development)**
**HIGH PRIORITY:**

3. **Settings UI Implementation** (#9) - **3-4 days**
   - Settings dialog/modal component
   - Font selection and editor preferences
   - Theme and behavior customization

4. **Enhanced Menu System** (#10) - **2-3 days**
   - Advanced View menu options
   - Window management features

### 🔧 **Additional Enhancements (Medium Priority)**
5. **Multi-window Support** (#8) - **5-7 days**
   - Tab system implementation
   - Multiple window management

6. **Plugin System Foundation** (#6) - **4-6 days**
   - Plugin architecture implementation
   - Extension API definition

## Decision-Making Framework

### Technology Choices ✅ DECISIONS COMPLETE AND IMPLEMENTED
**Current Status:**
- ✅ **Rust+Tauri+React**: Architecture complete and validated
- ✅ **CodeMirror 6**: **MIGRATION COMPLETE** - Full implementation ready
- ✅ **Zustand State Management**: Implemented and working
- ✅ **Tailwind CSS**: Styling system in place

### Architecture Principles
1. **Performance First**: Native Rust backend with optimized React frontend
2. **Modern UX**: React-based interface with contemporary design patterns
3. **Extensibility**: CodeMirror 6 plugin architecture foundation
4. **Cross-Platform**: Consistent experience across macOS, Windows, Linux
5. **Security**: Tauri security model with process isolation

### Risk Management ✅ MAJOR RISKS RESOLVED
**Resolved Risks:**
- ✅ **Architecture Risk**: Rust+Tauri+React fully validated and implemented
- ✅ **Editor Risk**: CodeMirror 6 migration successfully completed
- ✅ **Performance Risk**: Demonstrated improvement over Python version
- ✅ **Cross-platform Risk**: Tauri provides excellent platform integration

**Current Risks:**
- **Mermaid Integration Complexity**: Low risk - straightforward mermaid.js integration
- **Timeline Risk**: Feature complexity estimates (Mitigation: incremental development)

## Communication & Collaboration

### Issue Management
- **Focus on Mermaid Implementation**: #1 is now the highest priority
- **Update Progress Regularly**: Daily updates on Mermaid implementation progress
- **Document Technical Decisions**: Especially diagram integration patterns
- **Link Related Work**: Connect issues and PRs for better context

### Documentation Standards
- **Keep Implementation Docs Current**: Update FRONTEND_IMPLEMENTATION.md
- **Document Mermaid Integration**: Create integration guide
- **Maintain Architecture Decisions**: Document diagram system design
- **Update User Documentation**: Prepare for v2.0.0 release

## Resources & References

### Key Documentation
- [`README-v2.md`](./README-v2.md) - v2.0 project documentation
- [`FRONTEND_IMPLEMENTATION.md`](./FRONTEND_IMPLEMENTATION.md) - React implementation details
- [`CHANGELOG.md`](./CHANGELOG.md) - Version history tracking

### External Resources
- [Tauri Framework Documentation](https://tauri.app/) - Native app framework
- [CodeMirror 6 Documentation](https://codemirror.net/docs/) - **IMPLEMENTED** ✅
- [Mermaid.js Documentation](https://mermaid-js.github.io/mermaid/) - **FOR #1 IMPLEMENTATION**
- [React 18 Documentation](https://react.dev/) - Frontend framework
- [Zustand Documentation](https://docs.pmnd.rs/zustand/) - State management

### Project Links
- **Repository**: https://github.com/rheiger/markWriter
- **Project Board**: https://github.com/users/rheiger/projects/3
- **Current Branch**: `v2-development`
- **Issues**: Focus on #1 (Mermaid) - Ready for implementation!

---

## Agent-Specific Quick Start

### For Architecture Agents 🏗️
1. **IMMEDIATE**: Implement Mermaid diagrams (#1) - **TOP PRIORITY**
2. **Study CodeMirror integration**: Review frontend/src/ React implementation
3. **Plan Mermaid architecture**: Design diagram rendering in preview pane
4. **Design plugin system**: Prepare extensibility foundation (#6)

### For Development Agents 🔧
1. **IMMEDIATE**: Add mermaid.js dependency and create MermaidRenderer component
2. **CodeMirror 6 is ready**: Editor fully implemented, focus on preview enhancement
3. **Mermaid integration**: Parse mermaid blocks and render in preview pane
4. **Theme integration**: Ensure diagrams respect Light/Dark theme

### For Project Management Agents 📋
1. **Update issue priorities**: Mark #16 complete, prioritize #1 (Mermaid)
2. **Track Mermaid progress**: Monitor implementation daily
3. **Plan v2.0.0-beta release**: Coordinate feature completion timeline
4. **Close completed issues**: #16 can be closed as complete

---

## 🎯 **Current Status Summary**

**✅ ACHIEVED**: Complete CodeMirror 6 migration with menu integration
**🚀 PRIORITY**: Mermaid diagrams (#1) - **READY FOR IMMEDIATE IMPLEMENTATION**
**🎯 TARGET**: Mermaid diagrams working in 2-3 days
**🚀 GOAL**: v2.0.0-beta.1 with Mermaid support in ~1 week

*This document reflects the current Phase 3 state where CodeMirror 6 migration is complete and Mermaid diagram implementation is the immediate priority.*
