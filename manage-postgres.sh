#!/bin/bash

# Metro Bistro PostgreSQL Service Manager
# This script provides easy management of the Metro Bistro PostgreSQL systemd service

SERVICE_NAME="metro-bistro-postgres"

show_usage() {
    echo "Usage: $0 {start|stop|restart|status|logs|enable|disable|install}"
    echo ""
    echo "Commands:"
    echo "  start   - Start the Metro Bistro PostgreSQL service"
    echo "  stop    - Stop the Metro Bistro PostgreSQL service"
    echo "  restart - Restart the Metro Bistro PostgreSQL service"
    echo "  status  - Show service status"
    echo "  logs    - Show service logs (follow mode)"
    echo "  enable  - Enable service to start on boot"
    echo "  disable - Disable service from starting on boot"
    echo "  install - Install the service"
    echo ""
}

install_service() {
    echo "Installing Metro Bistro PostgreSQL service..."
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
       echo "This script must be run as root (use sudo)"
       exit 1
    fi
    
    # Copy service file to systemd directory
    echo "Copying service file to /etc/systemd/system..."
    cp metro-bistro-postgres.service /etc/systemd/system/
    
    # Reload systemd daemon
    echo "Reloading systemd daemon..."
    systemctl daemon-reload
    
    # Enable the service
    echo "Enabling service..."
    systemctl enable "$SERVICE_NAME"
    
    echo ""
    echo "Service installed successfully!"
    echo ""
    echo "To start the service:"
    echo "  sudo systemctl start $SERVICE_NAME"
    echo ""
    echo "To check service status:"
    echo "  sudo systemctl status $SERVICE_NAME"
    echo ""
}

case "$1" in
    install)
        install_service
        ;;
    start)
        echo "Starting Metro Bistro PostgreSQL service..."
        sudo systemctl start "$SERVICE_NAME"
        echo "Service started. Check status with: $0 status"
        ;;
    stop)
        echo "Stopping Metro Bistro PostgreSQL service..."
        sudo systemctl stop "$SERVICE_NAME"
        echo "Service stopped."
        ;;
    restart)
        echo "Restarting Metro Bistro PostgreSQL service..."
        sudo systemctl restart "$SERVICE_NAME"
        echo "Service restarted. Check status with: $0 status"
        ;;
    status)
        echo "Metro Bistro PostgreSQL service status:"
        sudo systemctl status "$SERVICE_NAME" --no-pager
        ;;
    logs)
        echo "Showing Metro Bistro PostgreSQL logs (press Ctrl+C to exit):"
        sudo journalctl -u "$SERVICE_NAME" -f
        ;;
    enable)
        echo "Enabling Metro Bistro PostgreSQL service to start on boot..."
        sudo systemctl enable "$SERVICE_NAME"
        echo "Service enabled."
        ;;
    disable)
        echo "Disabling Metro Bistro PostgreSQL service from starting on boot..."
        sudo systemctl disable "$SERVICE_NAME"
        echo "Service disabled."
        ;;
    *)
        show_usage
        exit 1
        ;;
esac 