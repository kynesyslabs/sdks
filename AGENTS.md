# AI Agent Instructions for Demos Network SDK

## Issue Tracking with br (beads_rust)

**IMPORTANT**: This project uses **br (beads_rust)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

**Note:** `br` is non-invasive and never executes git commands. After `br sync --flush-only`, you must manually run `git add .beads/ && git commit`.

### Why br?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Exports to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
br ready --json
```

**Create new issues:**
```bash
br create "Issue title" -t bug|feature|task -p 0-4 --json
br create "Issue title" -p 1 --deps discovered-from:br-123 --json
```

**Claim and update:**
```bash
br update br-42 --status in_progress --json
br update br-42 --priority 1 --json
```

**Complete work:**
```bash
br close br-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `br ready` shows unblocked issues
2. **Claim your task**: `br update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `br create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `br close <id> --reason "Done"`
6. **Sync and commit**:
   ```bash
   br sync --flush-only
   git add .beads/
   git commit -m "sync beads"
   ```
   Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- Clean repository root
- Clear separation between ephemeral and permanent documentation
- Easy to exclude from version control if desired
- Preserves planning history for archeological research
- Reduces noise when browsing the project

### Important Rules

- Use br for ALL task tracking
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Check `br ready` before asking "what should I work on?"
- Store AI planning docs in `history/` directory
- Do NOT create markdown TODO lists
- Do NOT use external issue trackers
- Do NOT duplicate tracking systems
- Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.

## Project Management with Mycelium

This project uses [Mycelium](https://github.com/tcsenpai/mycelium) (`myc`) for task and epic management.

### Quick Reference

```bash
# Initialize mycelium in this project (creates .mycelium/ directory)
myc init

# Create an epic (a large body of work)
myc epic create --title "Feature X" --description "Build feature X"

# Create tasks within an epic
myc task create --title "Implement Y" --description "Build the implementation for Y" --epic 1 --priority high --due 2025-12-31

# Task priorities: low, medium, high, critical
# Task status: open, closed

# List tasks
myc task list
myc task list --epic 1
myc task list --overdue
myc task list --blocked

# Manage dependencies (task 1 blocks task 2)
myc task link blocks --task 1 2
myc deps show 2

# Close tasks (blocked tasks cannot be closed without --force)
myc task close 1

# Assign tasks
myc assignee create --name "Alice" --github "alice"
myc task assign 1 1

# Link to external resources
myc task link github-issue --task 1 "owner/repo#123"
myc task link github-pr --task 1 "owner/repo#456"
myc task link url --task 1 "https://example.com"

# Project overview
myc summary

# Export data
myc export json
myc export csv
```

### Data Model

- **Epic**: A large body of work with a title and optional description (e.g., a feature or milestone)
- **Task**: A unit of work with a title and optional description, optionally linked to an epic
- **Dependency**: Task A blocks Task B (B cannot close until A is closed)
- **Assignee**: Person assigned to a task (can have GitHub username)
- **External Ref**: Link to GitHub issues/PRs or URLs

### Git Tracking

The `.mycelium/` directory contains the SQLite database and should be committed to git:

```bash
git add .mycelium/
git commit -m "Add mycelium project tracking"
```

### For AI Agents

When working on this project:

1. Check existing tasks: `myc task list`
2. Check blocked tasks: `myc task list --blocked`
3. Create tasks for new work: `myc task create --title "..." --description "..." --epic N`
4. Mark tasks complete when done: `myc task close N`
5. Use `--format json` for machine-readable output: `myc task list --format json`

## Mental Frameworks for Mycelium Usage

### 1. INVEST — Task Quality Gate

Before creating or updating any task, validate it against these criteria.
A task that fails more than one is not ready to be written.

| Criterion | Rule |
|---|---|
| **Independent** | Can be completed without unblocking other tasks first |
| **Negotiable** | The *what* is fixed; the *how* remains open |
| **Valuable** | Produces a verifiable, concrete outcome |
| **Estimable** | If you cannot size it, it is too vague or too large |
| **Small** | If it spans more than one work cycle, split it |
| **Testable** | Has an explicit, binary done condition |

> If a task fails **Estimable** or **Testable**, convert it to an Epic and decompose.

---

### 2. DAG — Dependency Graph Thinking

Before scheduling or prioritizing, model the implicit dependency graph.

**Rules:**
- No task moves to `in_progress` if it has an unresolved upstream blocker
- Priority is a function of both urgency **and fan-out** (how many tasks does completing this one unlock?)
- Always work the **critical path** first — not the task that feels most urgent

**Prioritization heuristic:**
```
score = urgency + (blocked_tasks_count × 1.5)
```

When creating a task, explicitly ask: *"What does this block, and what blocks this?"*
Set dependency links in Mycelium before touching status.

---

### 3. Principle of Minimal Surprise (PMS)

Mycelium's state must remain predictable and auditable at all times.

**Rules:**
- **Prefer idempotent operations** — update before you create; never duplicate
- **Check before write** — search for an equivalent item before creating a new one
- **Always annotate mutations** — every status change, priority shift, or reassignment must carry an explicit `reason` field
- **No orphan tasks** — every task must be linked to an Epic; every Epic to a strategic goal
- Deletions are a last resort; prefer `cancelled` status with a reason

> The state of Mycelium after any operation must be explainable to another agent with zero context.
