# Essential Development Commands

## Primary Development Commands
```bash
# Build the entire project
bun run build
# or with npm: npm run build

# Run all tests
bun test
# or: npm test

# Generate documentation
bun run typedoc
# or: npm run typedoc
```

## Specialized Test Commands
```bash
# Multi-chain tests
bun run test:multichain

# Transaction tests
bun run test:tx

# DemosWork tests
bun run test:demoswork

# Identity tests
bun run test:identities
bun run test:identities:pqc
bun run test:identities:web2

# Blockchain-specific tests
bun run test:btc
bun run test:evm
bun run test:aptos

# Cryptography tests
bun run test:pqc

# Bridge tests
bun run test:rubic-service

# Native functionality tests
bun run test:native
bun run test:web2
bun run test:demos
```

## Git Hooks
```bash
# Set up pre-push hook for quality checks
bun run setup:pre-push
```

## System Commands (Linux)
```bash
# File operations
ls -la                    # List files with details
find . -name "*.ts"       # Find TypeScript files
grep -r "pattern" src/    # Search in source code

# Git operations
git status               # Check working tree status
git diff                 # Show changes
git add .                # Stage all changes
git commit -m "message"  # Commit changes
git push origin main     # Push to main branch

# Build cleanup
rm -rf build            # Clean build directory
rm -rf node_modules     # Clean dependencies
```

## Package Management
```bash
# With Bun (preferred)
bun install              # Install dependencies
bun add package-name     # Add new dependency
bun remove package-name  # Remove dependency

# With npm (alternative)
npm install
npm install package-name
npm uninstall package-name
```

## Development Workflow
```bash
# Typical development cycle
git status                    # Check current state
bun run build                # Build project
bun test                     # Run tests
bun run typedoc              # Generate docs
git add .                    # Stage changes
git commit -m "description"  # Commit
git push                     # Push to remote
```