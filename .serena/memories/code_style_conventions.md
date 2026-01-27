# Code Style and Conventions

## TypeScript Configuration
- **Strict Mode**: Enabled with strict: true
- **Null Checks**: strictNullChecks: false (legacy compatibility)
- **Implicit Any**: noImplicitAny: false (allows flexibility)
- **Declaration Files**: Generated automatically
- **Source Maps**: Enabled for debugging

## Code Formatting (Prettier)
- **Quotes**: Double quotes ("example")
- **Semicolons**: No semicolons (semi: false)
- **Indentation**: 4 spaces (tabWidth: 4)
- **Line Width**: 80 characters
- **Arrow Functions**: No parentheses for single params (arrowParens: "avoid")
- **Trailing Commas**: Always on multiline (trailingComma: "all")
- **End of Line**: Unix LF

## ESLint Rules
- **Quotes**: Double quotes enforced
- **Semicolons**: Prohibited (semi: "never")
- **Line Breaks**: Unix style only
- **Unused Variables**: Disabled (allows flexibility)
- **Comma Dangle**: Required on multiline
- **Switch Colon Spacing**: Enforced

## Naming Conventions
- **Variables/Functions**: camelCase
- **Types/Interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: camelCase or kebab-case
- **Directories**: lowercase or camelCase

## Import Conventions
- **Path Aliases**: Use `@/` instead of relative imports (`../../../`)
- **Import Order**: External dependencies first, then internal modules
- **Named Imports**: Preferred over default imports where possible

## Documentation Standards
- **JSDoc**: Required for all new methods and functions
- **Inline Comments**: For complex logic and business rules
- **Type Annotations**: Explicit types for public APIs
- **Review Comments**: Use `// REVIEW:` for highlighting changes

## File Organization
- **Index Files**: Export public APIs from index.ts
- **Test Files**: Colocated with source or in tests/ directory
- **Type Definitions**: Separate .d.ts files when needed
- **Utilities**: Organized in utils/ directory with clear naming