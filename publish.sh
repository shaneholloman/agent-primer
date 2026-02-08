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

# Run checks (format, lint)
echo "Running checks..."
if ! bun run check; then
    echo "Error: Checks failed"
    exit 1
fi

# Build the project
echo "Building project..."
if ! bun run build; then
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
NEW_VERSION=$(bun -e "const pkg = await Bun.file('./package.json').json(); console.log(pkg.version)")

# Push to git
echo "Pushing to git..."
if ! { git push && git push --tags; }; then
    echo "Error: Failed to push to git"
    exit 1
fi

# Publish to npm (primary: agent-primer)
echo "Publishing agent-primer to npm..."
if ! bun publish --access public; then
    echo "Error: Failed to publish agent-primer to npm"
    exit 1
fi

# Publish alias (agent-prime) to hold the namespace
echo "Publishing agent-prime alias to npm..."
bun -e "
const pkg = await Bun.file('./package.json').json();
pkg.name = 'agent-prime';
pkg.bin['agent-prime'] = pkg.bin['agent-primer'];
await Bun.write('./package.json', JSON.stringify(pkg, null, '\t') + '\n');
"
if ! bun publish --access public; then
    echo "Warning: Failed to publish agent-prime alias to npm"
fi
git checkout package.json

echo "Successfully published version $NEW_VERSION"
