# Metro Bistro Backup Strategy

## Overview
This document outlines the backup strategy for Metro Bistro, ensuring data safety and recovery capabilities.

## ⚠️ IMPORTANT: Database Safety Rules

### NEVER run these commands on production data:
- `npx prisma migrate reset --force` (DROPS ALL DATA)
- `npx prisma db push --force-reset` (DROPS ALL DATA)
- Any command that mentions "reset" or "drop"

### Safe migration commands:
- `npx prisma migrate dev --name <migration_name>` (creates new migration)
- `npx prisma migrate deploy` (applies pending migrations)
- `npx prisma generate` (regenerates client)

## Backup Components

### 1. Database Backup
- **Format**: PostgreSQL dump (.sql)
- **Content**: Complete database with all tables, data, and schema
- **Location**: `/mnt/Backup/metro-bistro/`

### 2. Uploads Folder Backup
- **Content**: All recipe images and uploaded files
- **Cleanup**: Orphaned images (from deleted recipes) are removed before backup
- **Location**: `/mnt/Backup/metro-bistro/`

### 3. Backup Metadata
- **Content**: Backup date, statistics, and information
- **File**: `backup-info.txt` in each backup

## Backup Schedule

### Automated Backups
- **Frequency**: Daily at 2:00 AM
- **Retention**: 7 days (old backups automatically deleted)
- **Service**: `metro-bistro-backup.timer`

### Manual Backups
- **Command**: `./backup-metro-bistro.sh`
- **Use case**: Before major changes, deployments, or migrations

## Backup Scripts

### 1. `backup-metro-bistro.sh`
**Purpose**: Create comprehensive backup with cleanup

**Features**:
- Cleans orphaned images before backup
- Creates timestamped backup directory
- Compresses backup to `.tar.gz`
- Includes database statistics
- Auto-cleanup of old backups (7 days)

**Usage**:
```bash
./backup-metro-bistro.sh
```

### 2. `restore-metro-bistro.sh`
**Purpose**: Restore from backup

**Features**:
- Lists available backups
- Interactive backup selection
- Safety confirmations
- Stops/restarts backend service
- Preserves current data as backup

**Usage**:
```bash
./restore-metro-bistro.sh
```

## Backup Location

### Primary Location
- **Path**: `/mnt/Backup/metro-bistro/`
- **NFS Sync**: Automatically synced to cloud via NFS
- **Format**: `metro-bistro-backup-YYYYMMDD_HHMMSS.tar.gz`

### Backup Contents
```
metro-bistro-backup-20250730_180000.tar.gz
├── database.sql          # Complete database dump
├── uploads/              # Cleaned uploads folder
│   ├── recipe-*.jpg
│   └── ...
└── backup-info.txt       # Backup metadata
```

## Systemd Services

### Backup Timer
- **Service**: `metro-bistro-backup.timer`
- **Schedule**: Daily at 2:00 AM
- **Status**: `sudo systemctl status metro-bistro-backup.timer`

### Manual Backup Service
- **Service**: `metro-bistro-backup.service`
- **Usage**: `sudo systemctl start metro-bistro-backup.service`

## Monitoring and Maintenance

### Check Backup Status
```bash
# Check timer status
sudo systemctl status metro-bistro-backup.timer

# View recent backup logs
sudo journalctl -u metro-bistro-backup.service --since "24 hours ago"

# List available backups
ls -la /mnt/Backup/metro-bistro/
```

### Backup Verification
```bash
# Check backup integrity
tar -tzf /mnt/Backup/metro-bistro/metro-bistro-backup-*.tar.gz

# View backup info
tar -xzf /mnt/Backup/metro-bistro/metro-bistro-backup-*.tar.gz -O backup-info.txt
```

## Emergency Procedures

### Before Any Database Changes
1. **Create manual backup**:
   ```bash
   ./backup-metro-bistro.sh
   ```

2. **Verify backup**:
   ```bash
   ls -la /mnt/Backup/metro-bistro/
   ```

### If Database is Corrupted
1. **Stop services**:
   ```bash
   sudo systemctl stop metro-bistro-backend
   ```

2. **Restore from backup**:
   ```bash
   ./restore-metro-bistro.sh
   ```

3. **Verify restoration**:
   ```bash
   sudo systemctl start metro-bistro-backend
   # Check application functionality
   ```

## Best Practices

### 1. Always Backup Before:
- Running database migrations
- Deploying new versions
- Making schema changes
- Testing new features

### 2. Regular Verification:
- Check backup logs weekly
- Verify backup file integrity monthly
- Test restore procedure quarterly

### 3. Documentation:
- Keep this document updated
- Document any custom backup procedures
- Maintain restore procedure logs

## Troubleshooting

### Backup Fails
1. Check NFS mount: `df -h /mnt/Backup`
2. Check disk space: `df -h`
3. Check service logs: `sudo journalctl -u metro-bistro-backup.service`

### Restore Fails
1. Verify backup file integrity
2. Check database connection
3. Ensure sufficient disk space
4. Check service status

### Orphaned Images
The backup script automatically cleans orphaned images, but you can manually clean them:
```bash
cd backend/uploads
# The backup script will handle cleanup automatically
```

## Security Considerations

- Backup files contain sensitive data
- Ensure `/mnt/Backup` has appropriate permissions
- Consider encrypting backup files for additional security
- Regularly rotate backup access credentials

---

**Last Updated**: July 30, 2025
**Version**: 1.0 