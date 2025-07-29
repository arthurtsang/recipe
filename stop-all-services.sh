#!/bin/bash

# Metro Bistro - Stop All Services
# This script stops all Metro Bistro services

echo "=========================================="
echo "Stopping Metro Bistro Services"
echo "=========================================="
echo ""

# UI is served by the backend, so no separate stop needed
echo "1. UI is served by the backend"
echo "✅ UI will stop with backend"
echo ""

# Stop Backend
echo "2. Stopping Backend..."
cd /home/tsangc1/Projects/recipe/backend
./manage-backend.sh stop
echo "✅ Backend stopped"
echo ""

# Stop AI Server
echo "3. Stopping AI Server..."
cd /home/tsangc1/Projects/recipe/ai_service
./manage-service.sh stop
echo "✅ AI Server stopped"
echo ""

# Stop PostgreSQL
echo "4. Stopping PostgreSQL..."
cd /home/tsangc1/Projects/recipe
./manage-postgres.sh stop
echo "✅ PostgreSQL stopped"
echo ""

echo "=========================================="
echo "All Services Stopped!"
echo "=========================================="
echo ""
echo "To start all services: ./start-all-services.sh"
echo "To check status: ./check-all-services.sh" 