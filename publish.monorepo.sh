#!/bin/bash

# Script to rename all "src" sub-directories in "./dist" folder to "dist", move them to packages, and synchronize versions

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get current version from main package.json
get_main_version() {
    node -p "require('./package.json').version"
}

# Function to bump version and return new version
bump_version() {
    local bump_type=$1
    local current_version=$(get_main_version)
    local new_version=""

    # Parse current version
    IFS='.' read -ra VERSION_PARTS <<< "$current_version"
    local major=${VERSION_PARTS[0]}
    local minor=${VERSION_PARTS[1]}
    local patch=${VERSION_PARTS[2]}

    case $bump_type in
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
            echo -e "${RED}Invalid bump type. Use: patch, minor, or major${NC}"
            exit 1
            ;;
    esac

    echo "$new_version"
}

# Function to update package version
update_package_version() {
    local package_path=$1
    local new_version=$2

    if [ -f "$package_path/package.json" ]; then
        echo "Updating $package_path to version $new_version"

        # Update package.json version
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$package_path/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$package_path/package.json', JSON.stringify(pkg, null, 4) + '\n');
        "

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Successfully updated $package_path to v$new_version${NC}"
        else
            echo -e "${RED}✗ Failed to update $package_path${NC}"
        fi
    fi
}

# Check for non-interactive mode
NON_INTERACTIVE=false
if [[ "$1" == "-y" ]]; then
    NON_INTERACTIVE=true
    echo -e "${BLUE}Running in non-interactive mode (-y flag detected)${NC}"
fi

echo "Starting monorepo publish script..."

# Run build first and only proceed if successful
echo -e "${BLUE}Building project...${NC}"
if ! yarn build; then
    echo -e "${RED}Build failed. Please fix the build errors before proceeding.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build successful${NC}"
echo

# Check if dist directory exists
if [ ! -d "./dist" ]; then
    echo -e "${RED}Error: ./dist directory not found. Build may have failed.${NC}"
    exit 1
fi

echo "Found ./dist directory, processing..."

# Find all "src" directories within dist and rename them to "dist"
find ./dist -type d -name "src" | while read -r src_dir; do
    # Get the parent directory path
    parent_dir=$(dirname "$src_dir")

    # Create the new "dist" directory name
    new_dir="${parent_dir}/dist"

    echo "Renaming: $src_dir -> $new_dir"

    # Rename the directory
    mv "$src_dir" "$new_dir"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully renamed: $src_dir -> $new_dir${NC}"
    else
        echo -e "${RED}✗ Failed to rename: $src_dir${NC}"
    fi
done

echo "All 'src' directories have been renamed to 'dist'"
echo "Now moving dist folders to their corresponding packages..."

# Find all "dist" directories within the dist/packages folder and move them to packages
find ./dist/packages -type d -name "dist" | while read -r dist_dir; do
    # Get the package name from the path (e.g., ./dist/packages/utils/dist -> utils)
    package_name=$(basename $(dirname "$dist_dir"))

    # Create the target directory path in packages
    target_dir="./packages/${package_name}/dist"

    echo "Moving: $dist_dir -> $target_dir"

    # Remove existing dist directory in packages if it exists
    if [ -d "$target_dir" ]; then
        echo "  Removing existing dist directory: $target_dir"
        rm -rf "$target_dir"
    fi

    # Move the dist directory to packages
    mv "$dist_dir" "$target_dir"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully moved: $dist_dir -> $target_dir${NC}"
    else
        echo -e "${RED}✗ Failed to move: $dist_dir${NC}"
    fi
done

echo -e "${BLUE}All dist folders have been moved to their corresponding packages directory${NC}"
echo -e "${BLUE}Now synchronizing package versions...${NC}"

# Get the current main package.json version
CURRENT_VERSION=$(get_main_version)
echo -e "Current main package version: ${GREEN}v$CURRENT_VERSION${NC}"

if [ "$NON_INTERACTIVE" = true ]; then
    # Non-interactive mode: use current version without bumping
    NEW_VERSION="$CURRENT_VERSION"
    echo -e "${BLUE}Non-interactive mode: using current version v$NEW_VERSION${NC}"
else
    # Interactive mode: prompt for version bump
    echo
    echo "Select version bump type:"
    echo "1) patch (v$CURRENT_VERSION → v$(bump_version patch)) [default]"
    echo "2) minor (v$CURRENT_VERSION → v$(bump_version minor))"
    echo "3) major (v$CURRENT_VERSION → v$(bump_version major))"
    echo
    read -p "Enter choice (1/2/3) [default: 1]: " -n 1 -r
    echo

    # Set default to patch (option 1) if no input or invalid input
    if [[ -z "$REPLY" ]] || [[ ! "$REPLY" =~ ^[1-3]$ ]]; then
        REPLY="1"
    fi

    case $REPLY in
        1)
            BUMP_TYPE="patch"
            ;;
        2)
            BUMP_TYPE="minor"
            ;;
        3)
            BUMP_TYPE="major"
            ;;
        *)
            echo -e "${RED}Invalid choice. Cancelled.${NC}"
            exit 1
            ;;
    esac

    NEW_VERSION=$(bump_version $BUMP_TYPE)
    echo -e "${GREEN}✓ Version will be bumped to v$NEW_VERSION${NC}"

    # Update main package.json to the new version
    echo "Updating main package.json to version $NEW_VERSION"
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        pkg.version = '$NEW_VERSION';
        fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 4) + '\n');
    "

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully updated main package.json to v$NEW_VERSION${NC}"
    else
        echo -e "${RED}✗ Failed to update main package.json${NC}"
    fi
fi

# Update all package versions to match the main package version
for package_dir in ./packages/*/; do
    if [ -d "$package_dir" ]; then
        package_name=$(basename "$package_dir")
        echo "Processing package: $package_name"
        update_package_version "$package_dir" "$NEW_VERSION"
    fi
done

echo -e "${BLUE}=== VERSION SYNCHRONIZATION COMPLETE ===${NC}"
echo -e "${GREEN}All packages have been synchronized to version v$NEW_VERSION${NC}"

if [ "$NON_INTERACTIVE" = true ]; then
    # Non-interactive mode: show completion message
    echo
    echo -e "${BLUE}Non-interactive mode: Script completed successfully!${NC}"
    echo -e "${GREEN}All packages have been synchronized to version v$NEW_VERSION${NC}"
else
    # Interactive mode: prompt for commit and push
    echo
    echo -e "${YELLOW}Interactive mode: Commit and push changes?${NC}"
    echo -e "${BLUE}This will commit all changes with message \"release v$NEW_VERSION\" and push to remote${NC}"
    echo -e "${YELLOW}Press Enter to accept, or type 'n' to skip:${NC}"
    read -p "Commit and push? [Y/n]: " -r
    echo

    if [[ -z "$REPLY" ]] || [[ "$REPLY" =~ ^[Yy]$ ]]; then
        # User accepted: commit and push
        echo -e "${BLUE}Committing changes...${NC}"
        git add .
        git commit -m "release v$NEW_VERSION"

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Successfully committed changes${NC}"

            echo -e "${BLUE}Pushing to remote...${NC}"
            git push

            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Successfully pushed to remote${NC}"
                echo -e "${BLUE}🚀 Release v$NEW_VERSION is being processed on GitHub workflows!${NC}"
            else
                echo -e "${RED}✗ Failed to push to remote${NC}"
                echo -e "${YELLOW}You can manually push with: git push${NC}"
            fi
        else
            echo -e "${RED}✗ Failed to commit changes${NC}"
            echo -e "${YELLOW}You can manually commit with: git add . && git commit -m \"release v$NEW_VERSION\"${NC}"
        fi
    else
        # User declined: show next steps
        echo -e "${YELLOW}Commit and push skipped. Here are the next steps:${NC}"
        echo "1. Review the changes: git status"
        echo "2. Commit the synchronized versions: git add . && git commit -m \"release v$NEW_VERSION\""
        echo "3. Push to trigger deployment: git push"
        echo
        echo -e "${BLUE}All packages are ready for deployment with synchronized versions!${NC}"
    fi
fi
