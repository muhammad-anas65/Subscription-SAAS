#!/bin/bash
# =============================================================================
# SubTrack Restore Script
# =============================================================================
# This script restores the PostgreSQL database and uploads from a backup.
#
# WARNING: This will OVERWRITE existing data!
#
# Usage: ./restore.sh <backup_file>
# =============================================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-subtrack_postgres}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-subtrack_uploads_data}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Please provide a backup file to restore${NC}"
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -1t "$BACKUP_DIR"/subtrack_backup_*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}WARNING: This will overwrite existing data!${NC}"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled${NC}"
    exit 0
fi

echo -e "${GREEN}Starting SubTrack restore from: $BACKUP_FILE${NC}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract backup
echo -e "${YELLOW}Extracting backup...${NC}"
tar xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find extracted directory
EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "subtrack_backup_*" | head -1)

if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}Error: Could not find extracted backup directory${NC}"
    exit 1
fi

# Restore database
echo -e "${YELLOW}Restoring database...${NC}"
if docker ps | grep -q "$DB_CONTAINER"; then
    # Stop the backend to prevent conflicts
    echo -e "${YELLOW}Stopping backend container...${NC}"
    docker compose stop backend 2>/dev/null || true
    
    # Restore database
    docker exec -i "$DB_CONTAINER" psql -U subtrack < "$EXTRACTED_DIR/database.sql"
    
    # Start backend
    echo -e "${YELLOW}Starting backend container...${NC}"
    docker compose start backend 2>/dev/null || true
    
    echo -e "${GREEN}Database restore completed!${NC}"
else
    echo -e "${RED}Database container not found: $DB_CONTAINER${NC}"
    exit 1
fi

# Restore uploads
echo -e "${YELLOW}Restoring uploads...${NC}"
if [ -f "$EXTRACTED_DIR/uploads.tar.gz" ]; then
    docker run --rm -v "$UPLOADS_VOLUME":/target -v "$EXTRACTED_DIR":/source alpine \
        sh -c "rm -rf /target/* && tar xzf /source/uploads.tar.gz -C /target"
    echo -e "${GREEN}Uploads restore completed!${NC}"
else
    echo -e "${YELLOW}No uploads backup found, skipping...${NC}"
fi

echo -e "${GREEN}Restore completed successfully!${NC}"
echo "Please verify your data and restart the application if needed:"
echo "  docker compose restart"
