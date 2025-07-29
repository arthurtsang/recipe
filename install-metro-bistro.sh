#!/bin/bash

# Metro Bistro Complete Installation Script
# This script installs all Metro Bistro services (AI, Backend, UI)

set -e

echo "=========================================="
echo "Metro Bistro Complete Installation"
echo "=========================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

echo "Installing Metro Bistro services..."
echo ""

# Install PostgreSQL
echo "1. Installing PostgreSQL..."
cd /home/tsangc1/Projects/recipe
./manage-postgres.sh install
echo "✅ PostgreSQL installed"
echo ""

# Install AI Server
echo "2. Installing AI Server..."
cd /home/tsangc1/Projects/recipe/ai_service
sudo cp ai-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ai-server
echo "✅ AI Server installed"
echo ""

# Install Backend
echo "3. Installing Backend..."
cd /home/tsangc1/Projects/recipe/backend
sudo cp metro-bistro-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable metro-bistro-backend
echo "✅ Backend installed"
echo ""

# UI is now served by the backend
echo "4. UI will be served by the backend"
echo "✅ UI configured"
echo ""

echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Services installed:"
echo "  • PostgreSQL (metro-bistro-postgres) - Port 5433"
echo "  • AI Server (ai-server) - Port 8001"
echo "  • Backend + UI (metro-bistro-backend) - Port 4000"
echo ""
echo "To start all services:"
echo "  cd /home/tsangc1/Projects/recipe"
echo "  ./start-all-services.sh"
echo ""
echo "To check status of all services:"
echo "  ./check-all-services.sh"
echo ""
echo "Individual service management:"
echo "  • AI: cd ai_service && ./manage-service.sh {start|stop|restart|status}"
echo "  • Backend: cd backend && ./manage-backend.sh {start|stop|restart|status}"
echo "  • UI: cd web && ./manage-ui.sh {start|stop|restart|status}" 