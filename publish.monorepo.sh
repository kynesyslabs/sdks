#!/bin/bash

# Script to rename all "src" sub-directories in "./dist" folder to "dist" and move them to packages

echo "Starting monorepo publish script..."

# Check if dist directory exists
if [ ! -d "./dist" ]; then
    echo "Error: ./dist directory not found. Please run build first."
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
        echo "✓ Successfully renamed: $src_dir -> $new_dir"
    else
        echo "✗ Failed to rename: $src_dir"
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
        echo "✓ Successfully moved: $dist_dir -> $target_dir"
    else
        echo "✗ Failed to move: $dist_dir"
    fi
done

echo "Monorepo publish script completed!"
echo "All dist folders have been moved to their corresponding packages directory"
