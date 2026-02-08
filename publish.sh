#!/bin/bash

# Usage: ./publish.sh [major|minor|patch]
# Default: patch

VERSION_TYPE=${1:-patch}

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo "Error: Version type must be 'major', 'minor', or 'patch'"
    echo "Usage: ./publish.sh [major|minor|patch]"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Run checks (format, lint, type-check)
echo "Running checks..."
if ! npm run check; then
    echo "Error: Checks failed"
    exit 1
fi

# Build the project
echo "Building project..."
if ! npm run build; then
    echo "Error: Build failed"
    exit 1
fi

# Bump version
echo "Bumping $VERSION_TYPE version..."
if ! npm version "$VERSION_TYPE"; then
    echo "Error: Failed to bump version"
    exit 1
fi

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

# Push to git
echo "Pushing to git..."
if ! { git push && git push --tags; }; then
    echo "Error: Failed to push to git"
    exit 1
fi

# Publish to npm
echo "Publishing to npm..."
if ! npm publish --access public; then
    echo "Error: Failed to publish to npm"
    exit 1
fi

echo "✔ Successfully published version $NEW_VERSION"
