# Development Guidelines and Patterns

## Core Development Principles (from CLAUDE.md)

### Code Quality Standards
1. **Maintainability first**: Prioritize clean, readable, well-documented code
2. **Error handling**: Implement comprehensive error handling and validation
3. **Type safety**: Ensure full TypeScript type coverage and run type checks after changes
4. **Testing**: Follow existing test patterns and maintain coverage

### Development Workflow
1. **Plan before coding**: Create implementation plan for complex features
2. **Leverage existing code**: Use established patterns, utilities, and structures
3. **Seek confirmation**: Ask for clarification on ambiguous requirements
4. **Incremental development**: Make focused, reviewable changes

### Architecture Principles
- Follow established project structure and conventions
- Integrate with existing SDK methods and APIs
- Maintain consistency with current codebase patterns
- Document significant architectural decisions

## Best Practices

### Import and Path Management
- **Use `@/` path aliases** instead of relative imports (`../../../`)
- Prefer named imports over default imports
- Organize imports: external dependencies first, then internal modules

### Code Documentation
- **JSDoc format** for all new methods and functions
- **Inline comments** for complex logic and business rules
- **Review markers**: Add `// REVIEW:` before newly added features
- Document any non-obvious implementation decisions

### Error Handling
- Provide clear, actionable error messages that help with debugging
- Implement comprehensive validation
- Use TypeScript's type system to catch errors at compile time

### Naming Conventions
- Use descriptive names for variables, functions, and types
- Names should clearly express intent
- Follow TypeScript/JavaScript conventions (camelCase for functions/variables)

## Design Patterns in Use

### Multi-Chain Architecture
- Unified interface across different blockchain implementations
- Chain-specific modules with common abstractions
- Web and local SDK variants for different environments

### Module Organization
- Feature-based organization (bridge/, encryption/, wallet/, etc.)
- Clear separation of concerns
- Standardized export patterns through index.ts files

### Testing Patterns
- Chain-specific test suites
- Integration tests for complex workflows
- Timeout handling for blockchain operations (20s default)
- Test isolation and independent execution

## Communication Guidelines
- Ask questions when requirements are unclear
- Explain complex implementation decisions
- Provide context for non-obvious code choices
- Use clear commit messages and pull request descriptions

## Integration Considerations
- Changes should not break existing SDK consumers
- Maintain backward compatibility unless explicitly breaking
- Consider impact on other repositories using this SDK (e.g., ../node/)
- Update export statements in index.ts files when adding new features