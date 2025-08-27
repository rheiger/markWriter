# AI Agent Guidelines for MarkWriter Project

**Version**: 1.1  
**Last Updated**: August 27, 2025  
**Target Version**: v0.2.1 → v2.0.0  

## Project Overview

MarkWriter is a minimal, cross-platform Markdown editor that has successfully completed its **Phase 2 rewrite from Python+Qt to Rust+Tauri+React**. The project is currently at **v2.0.0-alpha.1** with full feature parity achieved and ready for **Phase 3 advanced features**.

### Current State ✅ PHASE 2 COMPLETE!
- **Technology Stack**: Rust (Tauri) + React + TypeScript + Zustand
- **Platforms**: macOS ✅, Windows ✅, Linux ✅  
- **Features**: WYSIWYG Markdown editing (Toast UI), file operations, HTML export, theme system
- **Architecture**: Modern desktop app with native performance and web UI flexibility

### Strategic Direction 🎯 PHASE 3 EXECUTION
- **CodeMirror 6 Migration**: Replace Toast UI Editor to enable advanced features
- **Mermaid Diagrams**: Implement embedded diagram support (primary user request)
- **Advanced Features**: Plugin system, multi-window support, enhanced UX
- **Performance & Polish**: Optimization, cross-platform testing, v2.0.0 release

## Repository Structure & Key Files

```
markWriter/
├── frontend/                # React+TypeScript frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── stores/         # Zustand state management
│   │   └── types/          # TypeScript definitions
│   ├── package.json        # Frontend dependencies
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

**🔥 IMMEDIATE PRIORITY** (Critical Path):
- **#16**: CodeMirror 6 Migration - **Ready to Execute** (6-8 days)
- **#1**: Embedded Mermaid Diagrams - **Blocked by #16** (2-3 days post-migration)

**📋 PHASE 3 READY** (Unblocked by completed rewrite):
- **#10**: Complete Menu System - **Core complete, advanced features ready**
- **#9**: Settings & Preferences System - **Foundation complete, UI needed**
- **#8**: Multiple Windows & Tabs Support - **Architecture ready**
- **#6**: Plugin System Architecture - **Foundation in place**
- **#5**: Draw.io Diagram Support - **Ready after CodeMirror**

**🛠️ ENHANCEMENT TRACK**:
- **#7**: Multi-Format Support (JSON/XML)
- **#4**: Linux Platform Support - **May be complete**

**🎯 STRATEGIC PLANNING**:
- **#15**: Migrate from Toast UI Editor to CodeMirror 6 - **Strategic decision documented**

### Workflow Best Practices
1. **Check Dependencies**: Focus on critical path (#16 → #1)
2. **Update Status**: Use GitHub issue assignments and progress tracking
3. **Follow Priorities**: CodeMirror migration enables most advanced features
4. **Document Decisions**: Update relevant docs and architectural decisions

## Technical Guidelines

### Code Quality Standards

**React/TypeScript (Frontend)**:
```typescript
// Follow existing patterns in frontend/src/
// - Use TypeScript strict mode with proper typing
// - Zustand for state management with Tauri integration
// - React 18+ patterns with hooks and function components
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
- Drive modern architecture based on current best practices
- Lead CodeMirror 6 migration technical implementation (#16)
- Design plugin system architecture for future extensibility
- Make technology decisions aligned with v2.0.0 goals

**Current Focus:**
- **CodeMirror 6 Migration**: Technical implementation and integration
- **Mermaid Architecture**: Design diagram rendering system
- **Plugin System Foundation**: Prepare architecture for extensibility
- **Performance Optimization**: Ensure v2.0 performance targets

**Key Deliverables:**
- CodeMirror 6 migration implementation
- Mermaid diagram rendering system
- Plugin architecture specification
- Performance optimization strategy

### 🔧 **Development Agent** (Implementation Focus)
**Primary Objectives:**
- Most coding and unit testing for Phase 3 features
- Implement CodeMirror 6 editor replacement
- Create Mermaid diagram rendering components
- Maintain code quality and testing standards

**Current Focus:**
- **CodeMirror 6 Implementation**: Replace Toast UI Editor components
- **React Component Development**: Modern editor and preview components
- **Tauri Integration**: Backend services for file operations
- **Cross-platform Testing**: Ensure functionality across platforms

**Key Deliverables:**
- CodeMirrorEditor.tsx component
- MermaidRenderer.tsx component  
- Enhanced preview pane implementation
- Comprehensive test coverage

### 📋 **Project Management Agent** (GitHub & Process Excellence)
**Primary Objectives:**
- Support contributors managing project and repo aligned with best practices
- Track critical path progress (#16 → #1 → advanced features)
- Ensure GitHub workflow optimization and release planning
- Coordinate Phase 3 feature development

**Current Focus:**
- **Critical Path Management**: Monitor #16 (CodeMirror) → #1 (Mermaid) progress
- **Issue Dependency Tracking**: Update blockers and enable parallel work
- **Release Planning**: Coordinate v2.0.0-beta and final release timeline
- **Documentation Maintenance**: Keep project docs current with development

**Key Deliverables:**
- GitHub issue organization and dependency management
- Release milestone planning and coordination
- Progress tracking and status reporting
- Contributor onboarding and process documentation

## Development Priorities (Immediate - 3 months)

### 🔥 **Critical Path (Next 2-3 weeks)**
**HIGHEST PRIORITY:**

1. **CodeMirror 6 Migration** (#16) - **6-8 development days**
   - **Phase 1**: Dependencies and basic setup (1-2 days)
   - **Phase 2**: Core editor replacement (2-3 days) 
   - **Phase 3**: Feature migration and theme integration (2-3 days)
   - **Phase 4**: Testing and optimization (1-2 days)

2. **Mermaid Diagrams** (#1) - **2-3 development days** (Post-CodeMirror)
   - Mermaid.js integration with CodeMirror preview
   - Theme-aware diagram rendering
   - Export functionality with embedded diagrams

### 🚀 **Phase 3 Advanced Features (Parallel Development)**
**HIGH PRIORITY:**

3. **Settings UI Implementation** (#9) - **3-4 days**
   - Settings dialog/modal component
   - Font selection and editor preferences
   - Theme and behavior customization

4. **Enhanced Menu System** (#10) - **2-3 days** 
   - Find/Replace functionality
   - Advanced View menu options
   - Window management features

### 🔧 **Additional Enhancements (Medium Priority)**
5. **Multi-window Support** (#8) - **5-7 days**
   - Tab system implementation
   - Multiple window management
   - Document state synchronization

6. **Plugin System Foundation** (#6) - **4-6 days**
   - Plugin architecture implementation
   - Extension API definition
   - Sample plugins and documentation

## Decision-Making Framework

### Technology Choices ✅ DECISIONS COMPLETE
**Current Status:**
- ✅ **Rust+Tauri+React**: Architecture complete and validated
- ✅ **Toast UI → CodeMirror 6**: Strategic decision made (#15), implementation ready (#16)
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
- ✅ **Performance Risk**: Demonstrated improvement over Python version
- ✅ **Cross-platform Risk**: Tauri provides excellent platform integration

**Current Risks:**
- **CodeMirror Migration**: Potential feature regression (Mitigation: thorough testing)
- **Timeline Risk**: Feature complexity estimates (Mitigation: incremental development)

## Communication & Collaboration

### Issue Management
- **Focus on Critical Path**: #16 → #1 dependency chain is highest priority
- **Update Progress Regularly**: Daily updates on CodeMirror migration progress
- **Document Technical Decisions**: Especially editor integration patterns
- **Link Related Work**: Connect issues and PRs for better context

### Documentation Standards
- **Keep Implementation Docs Current**: Update FRONTEND_IMPLEMENTATION.md
- **Document Migration Process**: Create CodeMirror migration guide
- **Maintain Architecture Decisions**: Document plugin system design
- **Update User Documentation**: Prepare for v2.0.0 release

## Resources & References

### Key Documentation
- [`README-v2.md`](./README-v2.md) - v2.0 project documentation
- [`FRONTEND_IMPLEMENTATION.md`](./FRONTEND_IMPLEMENTATION.md) - React implementation details
- [`CHANGELOG.md`](./CHANGELOG.md) - Version history tracking

### External Resources
- [Tauri Framework Documentation](https://tauri.app/) - Native app framework
- [CodeMirror 6 Documentation](https://codemirror.net/docs/) - **CRITICAL** for #16
- [Mermaid.js Documentation](https://mermaid-js.github.io/mermaid/) - For #1 implementation
- [React 18 Documentation](https://react.dev/) - Frontend framework
- [Zustand Documentation](https://docs.pmnd.rs/zustand/) - State management

### Project Links
- **Repository**: https://github.com/rheiger/markWriter
- **Project Board**: https://github.com/users/rheiger/projects/3
- **Current Branch**: `v2-development`
- **Issues**: Focus on #16 (CodeMirror) and #1 (Mermaid)

---

## Agent-Specific Quick Start

### For Architecture Agents 🏗️
1. **IMMEDIATE**: Lead CodeMirror 6 migration (#16) - **Critical Path**
2. **Study existing code**: Review frontend/src/ React implementation patterns
3. **Plan Mermaid integration**: Design diagram rendering architecture (#1)
4. **Design plugin system**: Prepare extensibility foundation (#6)

### For Development Agents 🔧
1. **IMMEDIATE**: Implement CodeMirror 6 editor replacement (#16)
2. **Set up development environment**: `npm run setup`, `npm run dev`
3. **Focus on editor components**: Replace Toast UI with CodeMirror
4. **Prepare Mermaid components**: Ready for post-migration implementation

### For Project Management Agents 📋
1. **Track critical path**: Monitor #16 → #1 progress daily
2. **Update issue dependencies**: Ensure blockers are current and accurate
3. **Plan v2.0.0 release**: Coordinate feature completion and testing
4. **Facilitate communication**: Keep architectural decisions documented

---

## 🎯 **Current Status Summary**

**✅ ACHIEVED**: Complete Rust+Tauri+React rewrite with feature parity  
**🔥 PRIORITY**: CodeMirror 6 migration (#16) - Ready to execute  
**🎯 TARGET**: Mermaid diagrams (#1) - Major user-requested feature  
**🚀 GOAL**: v2.0.0-beta.1 with advanced features in ~1 month  

*This document reflects the current Phase 3 state where foundation is complete and advanced feature implementation is the primary focus.*