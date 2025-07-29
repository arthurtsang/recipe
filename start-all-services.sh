#!/bin/bash

# Metro Bistro - Start All Services
# This script starts all Metro Bistro services

echo "=========================================="
echo "Starting Metro Bistro Services"
echo "=========================================="
echo ""

# Start PostgreSQL
echo "1. Starting PostgreSQL..."
cd /home/tsangc1/Projects/recipe
./manage-postgres.sh start
echo "✅ PostgreSQL started"
echo ""

# Start AI Server
echo "2. Starting AI Server..."
cd /home/tsangc1/Projects/recipe/ai_service
./manage-service.sh start
echo "✅ AI Server started"
echo ""

# Start Backend
echo "3. Starting Backend..."
cd /home/tsangc1/Projects/recipe/backend
./manage-backend.sh start
echo "✅ Backend started"
echo ""

# UI is served by the backend
echo "4. UI will be served by the backend"
echo "✅ UI configured"
echo ""

echo "=========================================="
echo "All Services Started!"
echo "=========================================="
echo ""
echo "Services are now running:"
echo "  • PostgreSQL: localhost:5433"
echo "  • AI Server: http://localhost:8001"
echo "  • Backend + UI: http://localhost:4000"
echo ""
echo "To check status: ./check-all-services.sh"
echo "To stop all: ./stop-all-services.sh" 