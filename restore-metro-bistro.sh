#!/bin/bash

# Metro Bistro Restore Script
# This script restores the database and uploads folder from a backup

set -e  # Exit on any error

# Configuration
BACKUP_DIR="/mnt/Backup/metro-bistro"
DB_NAME="metro_bistro"
DB_USER="metro_user"
DB_HOST="localhost"
DB_PORT="5432"  # Use internal port
UPLOADS_DIR="backend/uploads"

# PostgreSQL tools (using Docker)
PSQL="docker exec metro-bistro-postgres psql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Metro Bistro Restore Script${NC}"
echo "================================"

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Backup directory not found: $BACKUP_DIR${NC}"
    exit 1
fi

# List available backups
echo -e "${YELLOW}Available backups:${NC}"
ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null | while read -r line; do
    echo "  $line"
done

if [ ! "$(ls -A "$BACKUP_DIR"/*.tar.gz 2>/dev/null)" ]; then
    echo -e "${RED}No backup files found in $BACKUP_DIR${NC}"
    exit 1
fi

# Get backup file from user
echo ""
echo -e "${YELLOW}Enter the backup filename to restore (e.g., metro-bistro-backup-20250730_180000.tar.gz):${NC}"
read -r BACKUP_FILE

# Validate backup file exists
if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo -e "${RED}Backup file not found: $BACKUP_DIR/$BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Restoring from: $BACKUP_FILE${NC}"

# Confirm restore
echo -e "${RED}WARNING: This will overwrite the current database and uploads folder!${NC}"
echo -e "${YELLOW}Are you sure you want to continue? (yes/no)${NC}"
read -r CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
fi

# Create temporary restore directory
TEMP_DIR="/tmp/metro-bistro-restore-$$"
mkdir -p "$TEMP_DIR"

echo -e "${YELLOW}Extracting backup...${NC}"
cd "$TEMP_DIR"
tar -xzf "$BACKUP_DIR/$BACKUP_FILE"

# Find the extracted directory
RESTORE_DIR=$(ls -d metro-bistro-backup-* | head -n 1)
if [ -z "$RESTORE_DIR" ]; then
    echo -e "${RED}Could not find extracted backup directory${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo -e "${GREEN}Extracted to: $TEMP_DIR/$RESTORE_DIR${NC}"

# Check if database backup exists
if [ ! -f "$TEMP_DIR/$RESTORE_DIR/database.sql" ]; then
    echo -e "${RED}Database backup not found in extracted files${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Stop the backend service to prevent conflicts
echo -e "${YELLOW}Stopping Metro Bistro backend...${NC}"
sudo systemctl stop metro-bistro-backend

# Restore database
echo -e "${YELLOW}Restoring database...${NC}"
PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < "$TEMP_DIR/$RESTORE_DIR/database.sql"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Database restore completed${NC}"
else
    echo -e "${RED}Database restore failed!${NC}"
    sudo systemctl start metro-bistro-backend
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Restore uploads folder
if [ -d "$TEMP_DIR/$RESTORE_DIR/uploads" ]; then
    echo -e "${YELLOW}Restoring uploads folder...${NC}"
    
    # Backup current uploads (just in case)
    if [ -d "$UPLOADS_DIR" ]; then
        mv "$UPLOADS_DIR" "${UPLOADS_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Copy restored uploads
    cp -r "$TEMP_DIR/$RESTORE_DIR/uploads" "$UPLOADS_DIR"
    echo -e "${GREEN}Uploads restore completed${NC}"
else
    echo -e "${YELLOW}No uploads folder found in backup, skipping...${NC}"
fi

# Show backup info if available
if [ -f "$TEMP_DIR/$RESTORE_DIR/backup-info.txt" ]; then
    echo -e "${GREEN}Backup information:${NC}"
    cat "$TEMP_DIR/$RESTORE_DIR/backup-info.txt"
fi

# Clean up temporary files
rm -rf "$TEMP_DIR"

# Start the backend service
echo -e "${YELLOW}Starting Metro Bistro backend...${NC}"
sudo systemctl start metro-bistro-backend

echo -e "${GREEN}Metro Bistro restore completed successfully!${NC}"
echo -e "${GREEN}The application should now be running with the restored data.${NC}" 