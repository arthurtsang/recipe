#!/bin/bash

# Metro Bistro - Check All Services Status
# This script checks the status of all Metro Bistro services

echo "=========================================="
echo "Metro Bistro Services Status"
echo "=========================================="
echo ""

# Check PostgreSQL
echo "1. PostgreSQL Status:"
cd /home/tsangc1/Projects/recipe
./manage-postgres.sh status
echo ""

# Check AI Server
echo "2. AI Server Status:"
cd /home/tsangc1/Projects/recipe/ai_service
./manage-service.sh status
echo ""

# Check Backend
echo "3. Backend Status:"
cd /home/tsangc1/Projects/recipe/backend
./manage-backend.sh status
echo ""

# UI is served by the backend
echo "4. UI Status:"
echo "UI is served by the backend on port 4000"
echo ""

echo "=========================================="
echo "Service URLs:"
echo "=========================================="
echo "  • PostgreSQL: localhost:5433"
echo "  • AI Server: http://localhost:8001"
echo "  • Backend + UI: http://localhost:4000"
echo ""
echo "To start all: ./start-all-services.sh"
echo "To stop all: ./stop-all-services.sh" 