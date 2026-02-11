#!/bin/bash
# =============================================================================
# SubTrack Backup Script
# =============================================================================
# This script creates a backup of the PostgreSQL database and uploads directory.
# Run this script regularly via cron for automated backups.
#
# Usage: ./backup.sh [backup_name]
# =============================================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-subtrack_postgres}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-subtrack_uploads_data}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${1:-subtrack_backup_$DATE}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting SubTrack backup...${NC}"

# Create backup directory
mkdir -p "$BACKUP_PATH"

# Backup PostgreSQL database
echo -e "${YELLOW}Backing up PostgreSQL database...${NC}"
if docker ps | grep -q "$DB_CONTAINER"; then
    docker exec -t "$DB_CONTAINER" pg_dumpall -c -U subtrack > "$BACKUP_PATH/database.sql"
    echo -e "${GREEN}Database backup completed: $BACKUP_PATH/database.sql${NC}"
else
    echo -e "${RED}Database container not found: $DB_CONTAINER${NC}"
    exit 1
fi

# Backup uploads directory
echo -e "${YELLOW}Backing up uploads directory...${NC}"
if docker volume ls | grep -q "$UPLOADS_VOLUME"; then
    docker run --rm -v "$UPLOADS_VOLUME":/source -v "$BACKUP_PATH":/backup alpine \
        tar czf /backup/uploads.tar.gz -C /source .
    echo -e "${GREEN}Uploads backup completed: $BACKUP_PATH/uploads.tar.gz${NC}"
else
    echo -e "${YELLOW}Uploads volume not found, skipping...${NC}"
fi

# Create backup info file
cat > "$BACKUP_PATH/backup.info" << EOF
Backup Name: $BACKUP_NAME
Backup Date: $(date)
Database: subtrack
Container: $DB_CONTAINER
EOF

# Create compressed archive
echo -e "${YELLOW}Creating compressed archive...${NC}"
tar czf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" -C "$BACKUP_DIR" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"

echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "Backup location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"

# Cleanup old backups (keep last 30 days)
echo -e "${YELLOW}Cleaning up old backups...${NC}"
find "$BACKUP_DIR" -name "subtrack_backup_*.tar.gz" -mtime +30 -delete
echo -e "${GREEN}Cleanup completed!${NC}"
