# GitHub Copilot Instructions for Demos Network SDK

## Project Overview

This is the Demos Network SDK - a TypeScript SDK for interacting with the Demos Network blockchain infrastructure.

**Issue Tracking**: This project uses **bd (beads)** for all task tracking. Do NOT create markdown TODO lists.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Bun
- **Testing**: Follow existing test patterns
- **CI/CD**: GitHub Actions

## Coding Guidelines

### TypeScript Standards
- Ensure full TypeScript type coverage
- Run type checks after changes
- Use `@/` path aliases instead of relative imports

### Code Style
- Use JSDoc format for all new methods and functions
- Add `// REVIEW:` comments before newly added features
- Provide clear, actionable error messages
- Use descriptive names that clearly express intent

### Git Workflow
- Always commit `.beads/issues.jsonl` with code changes
- Run `bd sync` at end of work sessions
- Feature branches merge to main

## Issue Tracking with bd

**CRITICAL**: This project uses **bd** for ALL task tracking. Do NOT create markdown TODO lists.

### Essential Commands

```bash
# Find work
bd ready --json                    # Unblocked issues

# Create and manage
bd create "Title" -t bug|feature|task -p 0-4 --json
bd update <id> --status in_progress --json
bd close <id> --reason "Done" --json

# Search
bd list --status open --priority 1 --json
bd show <id> --json
```

### Workflow

1. **Check ready work**: `bd ready --json`
2. **Claim task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** `bd create "Found bug" -p 1 --deps discovered-from:<parent-id> --json`
5. **Complete**: `bd close <id> --reason "Done" --json`
6. **Sync**: `bd sync` (flushes changes to git immediately)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

## Important Rules

- Use bd for ALL task tracking
- Always use `--json` flag for programmatic use
- Run type checks after changes
- Follow existing patterns in the codebase
- Do NOT create markdown TODO lists

---

**For detailed workflows and advanced features, see [AGENTS.md](../AGENTS.md)**
