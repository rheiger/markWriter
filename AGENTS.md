# AI Agent Guidelines for MarkWriter Project

**Version**: 1.0  
**Last Updated**: August 26, 2025  
**Target Version**: v0.2.1 → v2.0.0  

## Project Overview

MarkWriter is a minimal, cross-platform Markdown editor built with Python and Qt (PySide6), featuring Toast UI Editor in a Qt WebEngine view. The project is currently at **v0.2.4** and planning a comprehensive architectural rewrite to Rust+Tauri+React for v2.0.0.

### Current State
- **Technology Stack**: Python 3.11+, PySide6, Qt WebEngine, Toast UI Editor
- **Platforms**: macOS ✅, Windows ✅, Linux (planned)  
- **Features**: WYSIWYG Markdown editing, file operations, HTML export, offline functionality
- **Architecture**: Single-window application with embedded web view

### Strategic Direction
- **Major Rewrite (v2.0.0)**: Complete transition to Rust+Tauri+React architecture
- **Incremental Improvements**: Enhance current Python version while planning migration
- **Focus Areas**: Performance, security, extensibility, modern UX

## Repository Structure & Key Files

```
markWriter/
├── markwrite.py              # Main Python application (18KB)
├── editor_offline.html       # Toast UI Editor integration
├── CHANGELOG.md             # Version history and changes
├── README.md                # Project documentation
├── requirements.txt         # Python dependencies
├── MarkWrite*.spec         # PyInstaller build specs
├── docs/
│   ├── DeveloperHandbook.md
│   ├── FinalRecommendationForRewrite.md  # Tauri evaluation
│   └── Signing-Notarization.md
├── assets/                  # Local Toast UI Editor assets
├── installer/               # Windows NSIS installer
└── .github/                 # CI/CD workflows
```

## Issue Tracking & Project Management

### Current Issue Classification

**🚀 EPIC Issues** (Major architectural work):
- **#3**: Rust+Tauri+React Rewrite (Primary epic for v2.0.0)

**🛠️ Current Stack Issues** (Python/Qt improvements):
- **#10**: Complete Menu System (Edit, View, Window, Help)
- **#7**: Multi-Format Support (JSON/XML)

**🚫 Blocked by Rewrite**:
- **#1**: Embedded Mermaid Diagrams
- **#5**: Draw.io Diagram Support  
- **#6**: Plugin System Architecture
- **#8**: Multiple Windows & Tabs Support

**🔬 Research & Planning**:
- **#12**: Tauri framework research (⚠️ PRIORITY)
- **#13**: Architecture design (depends on #12)

### Workflow Best Practices
1. **Check Dependencies**: Always review issue dependencies before starting work
2. **Update Status**: Use GitHub issue assignments and comments for progress tracking
3. **Follow Conventions**: Use emoji prefixes and consistent labeling
4. **Documentation**: Update relevant docs when making architectural decisions

## Technical Guidelines

### Code Quality Standards

**Python Code (Current)**:
```python
# Follow existing patterns in markwrite.py
# - Use type hints: `path: Path | None`
# - Handle exceptions gracefully with user-friendly messages
# - Maintain Qt best practices for event handling
# - Keep WebEngine bridge methods isolated and testable
```

**Architecture Decisions**:
- Maintain backward compatibility during transition
- Prioritize security and performance
- Follow cross-platform development best practices
- Document API changes and migration paths

### Testing Strategy
- **Manual Testing**: Cross-platform validation (macOS, Windows, Linux)
- **Integration Testing**: WebEngine bridge functionality
- **Performance Testing**: Startup time, memory usage, file operations
- **User Acceptance Testing**: Document workflow validation

## Agent Roles & Responsibilities

### 🏗️ **Architecture Agent** (Primary for Rewrite)
**Primary Objectives:**
- Drive architecture based on current best practices
- Research and validate Tauri framework capabilities (#12)
- Design system architecture for v2.0.0 (#13)
- Create technical specifications and migration plans

**Key Deliverables:**
- Architecture diagrams and specifications
- Technology evaluation reports (see `docs/FinalRecommendationForRewrite.md`)
- API design and plugin system architecture
- Migration roadmap and timeline estimates

**Focus Areas:**
- Security model and sandboxing
- Cross-platform compatibility
- Performance optimization
- Plugin system design

### 🔧 **Development Agent** (Implementation Focus)
**Primary Objectives:**
- Most coding and unit testing
- Implement current-stack improvements while rewrite is planned
- Create proof-of-concepts for new architecture
- Maintain code quality and testing standards

**Key Deliverables:**
- Feature implementations on current Python stack
- Rust+Tauri proof-of-concepts
- Unit tests and integration tests
- Bug fixes and performance improvements

**Focus Areas:**
- Python/Qt feature implementation
- Rust/Tauri learning and prototyping
- Cross-platform testing and validation
- Performance optimization

### 📋 **Project Management Agent** (GitHub & Process)
**Primary Objectives:**
- Support contributors managing project and repo
- Ensure GitHub best practices
- Track progress from v0.2.1 to v2.0.0
- Maintain issue organization and dependencies

**Key Deliverables:**
- Issue management and organization
- Project milestone tracking
- GitHub workflow optimization
- Release planning and coordination

**Focus Areas:**
- Issue dependency management
- GitHub Actions and CI/CD
- Release processes and documentation
- Contributor onboarding

## Development Priorities (v0.2.1 → v2.0.0)

### Phase 1: Research & Foundation (Immediate - 2 months)
**HIGH PRIORITY:**
1. **Complete Tauri Research** (#12) - CRITICAL PATH
   - Technical capabilities validation
   - Performance benchmarking vs current Python stack
   - Cross-platform compatibility assessment
   - Go/no-go decision for rewrite

2. **Architecture Design** (#13) - Depends on #12
   - System architecture diagrams
   - API specification documentation
   - Plugin system design
   - Migration strategy planning

### Phase 2: Current Stack Improvements (Parallel - 1-2 months)
**MEDIUM PRIORITY:**
1. **Complete Menu System** (#10)
   - Edit menu (undo/redo, cut/copy/paste, find/replace)
   - View menu (zoom, fullscreen, panels)
   - Window menu (minimize/maximize, new window)
   - Help menu (documentation, shortcuts, updates)

2. **Multi-Format Support** (#7)
   - JSON syntax highlighting and formatting
   - XML syntax highlighting and formatting
   - User-friendly display modes

### Phase 3: Rewrite Implementation (6-12 months)
**Blocked until Phase 1 completion:**
1. **Foundation**: Tauri project setup, basic React UI, Rust backend
2. **Core Features**: Toast UI integration, file operations, menu systems
3. **Advanced Features**: Embedded diagrams (#1, #5), plugin system (#6)
4. **Multi-window Support** (#8) and enhanced UX

### Phase 4: Migration & Release (2-3 months)
1. **User Migration**: Data migration tools, documentation
2. **Testing & Validation**: Cross-platform testing, performance validation
3. **Release Preparation**: Packaging, distribution, documentation

## Decision-Making Framework

### Technology Choices
**Current Evaluation Status:**
- ✅ **Tauri Framework**: Comprehensive evaluation completed (see `docs/FinalRecommendationForRewrite.md`)
- ⚠️ **Final Decision Pending**: Awaiting practical proof-of-concept validation (#12)
- 🔄 **Fallback Options**: Continue Python stack improvements if Tauri proves unsuitable

### Architecture Principles
1. **Security First**: Memory-safe backends, process isolation, capability-based permissions
2. **Performance**: Bundle size optimization, startup time, memory efficiency
3. **Extensibility**: Plugin system architecture, modular design
4. **Cross-Platform**: Consistent UX across macOS, Windows, Linux
5. **Maintainability**: Modern development practices, clear API boundaries

### Risk Management
**High-Impact Risks:**
- Rust learning curve delays (6-12 months investment)
- Cross-platform compatibility issues
- Performance degradation during transition
- User workflow disruption

**Mitigation Strategies:**
- Incremental migration approach
- Parallel development tracks
- Comprehensive testing protocols
- User feedback integration

## Communication & Collaboration

### Issue Management
- **Use clear, descriptive titles** with emoji prefixes
- **Reference dependencies** explicitly in issue descriptions
- **Update progress regularly** through comments and status changes
- **Link related issues** and PRs for context

### Documentation Standards
- **Update CHANGELOG.md** for user-facing changes
- **Maintain README.md** accuracy with current features and roadmap
- **Document architectural decisions** in dedicated files
- **Create migration guides** for major changes

### Code Review Process
- **Focus on architecture alignment** with long-term goals
- **Validate cross-platform compatibility** 
- **Ensure security best practices**
- **Maintain performance standards**

## Resources & References

### Key Documentation
- [`docs/FinalRecommendationForRewrite.md`](./docs/FinalRecommendationForRewrite.md) - Comprehensive Tauri evaluation
- [`docs/DeveloperHandbook.md`](./docs/DeveloperHandbook.md) - Contributor setup and processes
- [`CHANGELOG.md`](./CHANGELOG.md) - Version history and feature tracking

### External Resources
- [Tauri Framework Documentation](https://tauri.app/)
- [Toast UI Editor](https://github.com/nhn/tui.editor)
- [Rust Learning Resources](https://www.rust-lang.org/learn)
- [PySide6 Documentation](https://doc.qt.io/qtforpython-6/)

### Project Links
- **Repository**: https://github.com/rheiger/markWriter
- **Project Board**: https://github.com/users/rheiger/projects/3
- **Releases**: https://github.com/rheiger/markWriter/releases

---

## Agent-Specific Quick Start

### For Architecture Agents
1. **Start with #12**: Complete Tauri research and evaluation
2. **Review existing analysis**: Study `docs/FinalRecommendationForRewrite.md`
3. **Create proof-of-concept**: Validate technical assumptions
4. **Design system architecture**: Focus on plugin system and security model

### For Development Agents
1. **Set up development environment**: Python 3.11+, PySide6, current toolchain
2. **Focus on current stack**: Issues #10 (menus) and #7 (multi-format support)
3. **Learn Rust/Tauri**: Prepare for rewrite implementation
4. **Maintain test coverage**: Ensure quality throughout transition

### For Project Management Agents
1. **Review issue dependencies**: Understand current blocking relationships
2. **Monitor critical path**: Track #12 → #13 → rewrite implementation
3. **Coordinate release planning**: Balance current improvements with rewrite timeline
4. **Facilitate communication**: Ensure architectural decisions are documented and shared

---

*This document serves as the primary reference for AI agents working on the MarkWriter project. Keep it updated as the project evolves and new decisions are made.*