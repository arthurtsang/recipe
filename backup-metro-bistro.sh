#!/bin/bash

# Metro Bistro Backup Script
# This script backs up the database and uploads folder to /mnt/Backup

set -e  # Exit on any error

# Configuration
BACKUP_DIR="/mnt/Backup/metro-bistro"
DB_NAME="metro_bistro"
DB_USER="metro_user"
DB_HOST="localhost"
DB_PORT="5432"  # Use internal port
UPLOADS_DIR="backend/uploads"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="metro-bistro-backup-${DATE}"

# PostgreSQL tools (using Docker)
PSQL="docker exec metro-bistro-postgres psql"
PG_DUMP="docker exec metro-bistro-postgres pg_dump"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Metro Bistro backup...${NC}"

# Check if backup directory exists, create if not
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}Creating backup directory: $BACKUP_DIR${NC}"
    mkdir -p "$BACKUP_DIR"
fi

# Create timestamped backup directory
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

echo -e "${GREEN}Backup directory: $BACKUP_PATH${NC}"

# Step 1: Clean up orphaned images
echo -e "${YELLOW}Step 1: Cleaning up orphaned images...${NC}"

# Create a temporary script to find orphaned images inside the container
docker exec metro-bistro-postgres bash -c 'cat > /tmp/cleanup_images.sql << "EOF"
-- Find all image URLs in the database
\copy (SELECT DISTINCT "imageUrl" FROM "Recipe" WHERE "imageUrl" IS NOT NULL AND "imageUrl" != '\''\'\'') TO '\''/tmp/db_images.txt'\'' WITH CSV;
\copy (SELECT DISTINCT "imageUrl" FROM "RecipeVersion" WHERE "imageUrl" IS NOT NULL AND "imageUrl" != '\''\'\'') TO '\''/tmp/db_images.txt'\'' WITH CSV APPEND;
EOF'

# Run the SQL to get database images
PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f /tmp/cleanup_images.sql

# Copy the results file from container to host
docker cp metro-bistro-postgres:/tmp/db_images.txt /tmp/db_images.txt

# Find orphaned files (files in uploads that aren't in database)
echo -e "${YELLOW}Finding orphaned images...${NC}"
cd "$UPLOADS_DIR"
find . -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" \) | while read -r file; do
    # Remove ./ prefix
    file_relative=${file#./}
    
    # Check if this file is referenced in the database
    if ! grep -q "/uploads/$file_relative" /tmp/db_images.txt; then
        echo -e "${RED}Removing orphaned image: $file_relative${NC}"
        rm -f "$file"
    fi
done

# Clean up temporary files
rm -f /tmp/db_images.txt
docker exec metro-bistro-postgres rm -f /tmp/cleanup_images.sql /tmp/db_images.txt

echo -e "${GREEN}Image cleanup completed${NC}"

# Step 2: Backup database
echo -e "${YELLOW}Step 2: Backing up database...${NC}"
DB_BACKUP_FILE="$BACKUP_PATH/database.sql"
PGPASSWORD=metro_password $PG_DUMP -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > "$DB_BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Database backup completed: $DB_BACKUP_FILE${NC}"
    echo "Database size: $(du -h "$DB_BACKUP_FILE" | cut -f1)"
else
    echo -e "${RED}Database backup failed!${NC}"
    exit 1
fi

# Step 3: Backup uploads folder
echo -e "${YELLOW}Step 3: Backing up uploads folder...${NC}"
UPLOADS_BACKUP_DIR="$BACKUP_PATH/uploads"
mkdir -p "$UPLOADS_BACKUP_DIR"

if [ -d "$UPLOADS_DIR" ]; then
    cp -r "$UPLOADS_DIR"/* "$UPLOADS_BACKUP_DIR/"
    echo -e "${GREEN}Uploads backup completed: $UPLOADS_BACKUP_DIR${NC}"
    echo "Uploads size: $(du -sh "$UPLOADS_BACKUP_DIR" | cut -f1)"
else
    echo -e "${YELLOW}Uploads directory not found, skipping...${NC}"
fi

# Step 4: Create backup metadata
echo -e "${YELLOW}Step 4: Creating backup metadata...${NC}"
cat > "$BACKUP_PATH/backup-info.txt" << EOF
Metro Bistro Backup
==================
Backup Date: $(date)
Backup Name: $BACKUP_NAME
Database: $DB_NAME
Uploads Directory: $UPLOADS_DIR

Backup Contents:
- database.sql: Full database dump
- uploads/: Cleaned uploads folder (orphaned images removed)

Database Statistics:
$(PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 'Users: ' || COUNT(*) FROM \"User\";" | tail -n 1)
$(PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 'Recipes: ' || COUNT(*) FROM \"Recipe\";" | tail -n 1)
$(PGPASSWORD=metro_password $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 'Ratings: ' || COUNT(*) FROM \"Rating\";" | tail -n 1)

Backup completed successfully!
EOF

# Step 5: Compress backup
echo -e "${YELLOW}Step 5: Compressing backup...${NC}"
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo -e "${GREEN}Backup compressed: ${BACKUP_NAME}.tar.gz${NC}"
echo "Final backup size: $(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)"

# Step 6: Clean up old backups (keep last 7 days)
echo -e "${YELLOW}Step 6: Cleaning up old backups (keeping last 7 days)...${NC}"
find "$BACKUP_DIR" -name "metro-bistro-backup-*.tar.gz" -mtime +7 -delete

echo -e "${GREEN}Metro Bistro backup completed successfully!${NC}"
echo -e "${GREEN}Backup location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz${NC}" 