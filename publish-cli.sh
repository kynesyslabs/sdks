#!/bin/bash
#
# publish-cli.sh — programmatic publish script for demos-sdk
# Supports both interactive and non-interactive (CI-friendly) usage
#
# Usage:
#   publish-cli.sh                    # interactive (same as original)
#   publish-cli.sh --bump patch       # non-interactive: bump patch and push
#   publish-cli.sh --bump minor --yes  # non-interactive: no confirmations
#   publish-cli.sh --dry-run           # show what would happen
#   publish-cli.sh --version           # print current version
#   publish-cli.sh --redo             # redo last release
#   publish-cli.sh --redo --yes       # redo without confirmation
#   publish-cli.sh --help             # show this help
#

# Ensure bun is available (mise-managed install)
export PATH="/home/tcsenpai/.local/share/mise/installs/bun/1.3.3/bin:$PATH"

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Defaults ─────────────────────────────────────────────────────────────────
DRY_RUN=false
AUTO_YES=false
BUMP_TYPE=""
REDO_MODE=false

# ─── Helpers ───────────────────────────────────────────────────────────────────
usage() {
    cat << 'EOF'
publish-cli.sh — programmatic publish script for demos-sdk

Usage:
  publish-cli.sh                    # interactive (same as original)
  publish-cli.sh --bump patch      # non-interactive: bump patch and push
  publish-cli.sh --bump minor --yes # non-interactive: no confirmations
  publish-cli.sh --dry-run          # show what would happen
  publish-cli.sh --version          # print current version
  publish-cli.sh --redo            # redo last release
  publish-cli.sh --redo --yes      # redo without confirmation
  publish-cli.sh --help            # show this help

Options:
  --bump <type>    Bump version: patch, minor, or major (non-interactive)
  --yes, -y         Skip all confirmation prompts
  --dry-run         Show what would happen without doing it
  --version, -v     Print current version and exit
  --redo, -r        Redo last release (no version bump)
  --help, -h        Show this help message

Examples:
  ./publish-cli.sh                           # interactive release
  ./publish-cli.sh --bump patch              # bump patch, commit and push
  ./publish-cli.sh --bump minor --yes        # non-interactive minor bump
  ./publish-cli.sh --bump major --dry-run    # see what a major bump would do
  ./publish-cli.sh --redo --yes              # redo last release without asking
EOF
}

get_current_version() {
    node -p "require('./package.json').version"
}

bump_version() {
    local bump_type=$1
    local current_version=$(get_current_version)

    IFS='.' read -ra VERSION_PARTS <<< "$current_version"
    local major="${VERSION_PARTS[0]}"
    local minor="${VERSION_PARTS[1]}"
    local patch="${VERSION_PARTS[2]}"
    local new_version=""

    case "$bump_type" in
        patch)
            patch=$((patch + 1))
            new_version="${major}.${minor}.${patch}"
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            new_version="${major}.${minor}.${patch}"
            ;;
        major)
            major=$((major + 1))
            minor=0
            patch=0
            new_version="${major}.${minor}.${patch}"
            ;;
        *)
            echo -e "${RED}Error: invalid bump type '$bump_type'. Use patch, minor, or major${NC}" >&2
            exit 1
            ;;
    esac

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[dry-run]${NC} Would bump ${YELLOW}v${current_version}${NC} → ${GREEN}v${new_version}${NC}"
        echo -e "${CYAN}[dry-run]${NC} Would run: bun run build"
        echo -e "${CYAN}[dry-run]${NC} Would commit: ${BOLD}release v${new_version}${NC}"
        echo -e "${CYAN}[dry-run]${NC} Would push to remote"
        echo -e "${GREEN}✓ Dry run complete — no changes made${NC}"
        exit 0
    fi

    node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '$new_version';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 4) + '\n');
"
    echo "$new_version"
}

confirm() {
    local message=$1
    if [ "$AUTO_YES" = true ]; then
        echo -e "${CYAN}[auto-yes]${NC} $message"
        return 0
    fi
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${RED}Cancelled.${NC}"
        exit 1
    fi
}

run_build() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[dry-run]${NC} Would run: bun run build"
        return 0
    fi
    echo -e "${BLUE}Building project...${NC}"
    if ! npm run build; then
        echo -e "${RED}Build failed. Please fix the build errors before proceeding.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Build successful${NC}"
}

commit_and_push() {
    local version=$1
    local commit_msg="release v$version"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[dry-run]${NC} Would commit: ${BOLD}$commit_msg${NC}"
        echo -e "${CYAN}[dry-run]${NC} Would push to remote"
        return 0
    fi

    git add package.json
    git commit -m "$commit_msg"
    echo -e "${GREEN}✓ Committed version bump${NC}"

    git push
    echo -e "${GREEN}✓ Pushed to remote${NC}"
    echo -e "${BLUE}🚀 Release workflow should start shortly for v${version}${NC}"
}

redo_release() {
    local current_version=$(get_current_version)
    local commit_msg="release v$current_version"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[dry-run]${NC} Would create empty commit: ${BOLD}$commit_msg${NC}"
        echo -e "${CYAN}[dry-run]${NC} Would push to remote"
        return 0
    fi

    confirm "This will create a new commit for the same version and trigger the release workflow."

    git commit --allow-empty -m "$commit_msg"
    echo -e "${GREEN}✓ Created empty commit for release v${current_version}${NC}"

    git push
    echo -e "${GREEN}✓ Pushed to remote${NC}"
    echo -e "${BLUE}🚀 Release workflow should start shortly for v${current_version}${NC}"
}

# ─── Parse Args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --bump)
            BUMP_TYPE="$2"
            shift 2
            ;;
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --version|-v)
            get_current_version
            exit 0
            ;;
        --redo|-r)
            REDO_MODE=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            usage >&2
            exit 1
            ;;
    esac
done

# ─── Main ─────────────────────────────────────────────────────────────────────
if [ "$REDO_MODE" = true ]; then
    current_version=$(get_current_version)
    echo -e "${BLUE}=== REDO RELEASE ===${NC}"
    echo -e "Target version: ${GREEN}v${current_version}${NC}"
    redo_release
    exit 0
fi

# Interactive mode (no --bump provided)
if [ -z "$BUMP_TYPE" ]; then
    echo -e "${BLUE}=== NEW RELEASE (interactive) ===${NC}"

    current_version=$(get_current_version)
    next_patch=$(node -e "const [m,n,p]='$current_version'.split('.').map(Number); console.log(m+'.'+n+'.'+(p+1))")
    next_minor=$(node -e "const [m,n,p]='$current_version'.split('.').map(Number); console.log(m+'.'+(n+1)+'.0')")
    next_major=$(node -e "const [m,n,p]='$current_version'.split('.').map(Number); console.log((m+1)+'.0.0')")

    echo
    echo "Current version: ${GREEN}v${current_version}${NC}"
    echo
    echo "Select version bump type:"
    echo "  1) patch  → v${current_version} → v${next_patch} [default]"
    echo "  2) minor  → v${current_version} → v${next_minor}"
    echo "  3) major  → v${current_version} → v${next_major}"
    echo
    read -p "Enter choice (1/2/3) [default: 1]: " -n 1 -r
    echo

    if [[ -z "$REPLY" ]] || [[ ! "$REPLY" =~ ^[1-3]$ ]]; then
        REPLY="1"
    fi

    case $REPLY in
        1) BUMP_TYPE="patch" ;;
        2) BUMP_TYPE="minor" ;;
        3) BUMP_TYPE="major" ;;
    esac
fi

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: --bump must be patch, minor, or major (got: '$BUMP_TYPE')${NC}" >&2
    exit 1
fi

# ─── Execute ──────────────────────────────────────────────────────────────────
current_version=$(get_current_version)
echo -e "${BLUE}=== RELEASE ===${NC}"
echo -e "Current version: ${YELLOW}v${current_version}${NC}"

if [ "$DRY_RUN" = true ]; then
    # Compute next version for display without mutating package.json
    next=$(node -e "
const [m,n,p]='$current_version'.split('.').map(Number);
const bump = '$BUMP_TYPE';
if (bump==='patch') console.log(m+'.'+n+'.'+(p+1));
else if (bump==='minor') console.log(m+'.'+(n+1)+'.0');
else console.log((m+1)+'.0.0');
")
    echo -e "${CYAN}[dry-run]${NC} Would run: bun run build"
    echo -e "${CYAN}[dry-run]${NC} Would bump ${YELLOW}v${current_version}${NC} → ${GREEN}v${next}${NC}"
    echo -e "${CYAN}[dry-run]${NC} Would commit: ${BOLD}release v${next}${NC}"
    echo -e "${CYAN}[dry-run]${NC} Would push to remote"
    echo -e "${GREEN}✓ Dry run complete — no changes made${NC}"
    exit 0
fi

run_build

new_version=$(bump_version "$BUMP_TYPE")
echo -e "${GREEN}✓ Version bumped to v${new_version}${NC}"

confirm "This will commit the version bump and push 'release v${new_version}' to trigger the release workflow."

commit_and_push "$new_version"
