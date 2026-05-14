#!/bin/bash

# WoWok Skills Deploy Script
# Usage: ./skill-deploy.sh [version]
# Example: ./skill-deploy.sh 1.0.1
#
# This script downloads code from internal Git server and publishes to npm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INTERNAL_GIT="ssh://git@43.134.162.89/home/git/rep/skills.git"
BRANCH="master"
PACKAGE_NAME="wowok-skills"
TEMP_DIR=$(mktemp -d)
SOURCE_DIR=""

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

cleanup() {
    log_info "Cleaning up temporary directory..."
    rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

# Check dependencies
check_deps() {
    log_step "Checking dependencies..."
    
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "node is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    log_info "All dependencies are available"
}

# Get version from package.json
get_version_from_package() {
    if [ -f "package.json" ]; then
        VERSION=$(node -p "require('./package.json').version")
        log_info "Using version from package.json: $VERSION"
    else
        log_error "package.json not found"
        exit 1
    fi
}

# Get version from argument or package.json
get_version() {
    if [ -n "$1" ]; then
        VERSION="$1"
        log_info "Using specified version: $VERSION"
    else
        # Will be set after cloning, when package.json is available
        VERSION=""
    fi
}

# Clone from internal Git server
clone_internal() {
    log_step "Cloning from internal Git server..."
    log_info "Repository: $INTERNAL_GIT"
    log_info "Branch: $BRANCH"
    
    cd "$TEMP_DIR"
    
    # Clone the specific branch
    git clone --single-branch --branch "$BRANCH" "$INTERNAL_GIT" skills || {
        log_error "Failed to clone from internal server"
        exit 1
    }
    
    if [ ! -d "skills" ]; then
        log_error "Failed to clone repository"
        exit 1
    fi
    
    SOURCE_DIR="$TEMP_DIR/skills"
    cd "$SOURCE_DIR"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "找不到 package.json，请检查仓库结构"
        log_info "当前目录: $(pwd)"
        log_info "目录内容:"
        ls -la
        exit 1
    fi
    
    log_info "Successfully cloned from internal server to $SOURCE_DIR"
}

# Update version in package.json
update_version() {
    log_step "Updating version to $VERSION..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in $SOURCE_DIR"
        log_info "Contents of $SOURCE_DIR:"
        ls -la "$SOURCE_DIR"
        exit 1
    fi
    
    # Update version using npm
    npm version "$VERSION" --no-git-tag-version --allow-same-version
    log_info "Version updated to $VERSION"
}

# Install dependencies
install_deps() {
    log_step "Installing dependencies..."
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
}

# Build project
build_project() {
    log_step "Building project..."
    npm run build
}

# Check npm login
check_npm_auth() {
    log_step "Checking npm authentication..."
    
    if ! npm whoami &> /dev/null; then
        log_error "Not logged in to npm"
        log_info "Please run: npm login"
        exit 1
    fi
    
    USER=$(npm whoami)
    log_info "Logged in as: $USER"
}

# Publish to npm
publish_package() {
    log_step "Publishing to npm..."
    
    # Check if version already exists
    if npm view "$PACKAGE_NAME@$VERSION" version &> /dev/null; then
        log_warn "Version $VERSION already exists on npm"
        read -p "Do you want to continue? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Publish cancelled"
            exit 0
        fi
    fi
    
    # Publish
    npm publish --access public
    
    log_info "Successfully published $PACKAGE_NAME@$VERSION"
}

# Verify publish
verify_publish() {
    log_step "Verifying publish..."
    sleep 3
    
    if npm view "$PACKAGE_NAME@$VERSION" version &> /dev/null; then
        log_info "Package is available on npm:"
        npm view "$PACKAGE_NAME@$VERSION"
    else
        log_warn "Package may not be immediately available (npm propagation delay)"
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [version]"
    echo ""
    echo "Examples:"
    echo "  $0           # Deploy with version from package.json"
    echo "  $0 1.0.1     # Deploy version 1.0.1"
    echo "  $0 patch     # Bump patch version"
    echo "  $0 minor     # Bump minor version"
    echo "  $0 major     # Bump major version"
    echo ""
    echo "Environment Variables:"
    echo "  DRY_RUN=1       # Dry run (don't actually publish)"
}

# Main deployment flow
main() {
    log_info "Starting WoWok Skills deployment..."
    log_info "===================================="
    
    # Show help
    if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
        show_usage
        exit 0
    fi
    
    check_deps
    get_version "$1"
    clone_internal
    
    # If no version specified, use version from package.json
    if [ -z "$VERSION" ]; then
        get_version_from_package
    fi
    
    update_version
    install_deps
    build_project
    
    check_npm_auth
    
    # Dry run
    if [ "$DRY_RUN" == "1" ]; then
        log_warn "DRY RUN - Not actually publishing"
        log_info "Would publish: $PACKAGE_NAME@$VERSION"
        exit 0
    fi
    
    publish_package
    verify_publish
    
    log_info "===================================="
    log_info "Deployment completed successfully!"
    log_info "Package: $PACKAGE_NAME@$VERSION"
    log_info "Install with: npm install $PACKAGE_NAME@$VERSION"
}

# Run main function
main "$@"
