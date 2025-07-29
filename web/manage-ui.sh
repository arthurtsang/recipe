#!/bin/bash

# Metro Bistro UI Service Manager
# This script provides easy management of the Metro Bistro UI systemd service

SERVICE_NAME="metro-bistro-ui"

show_usage() {
    echo "Usage: $0 {start|stop|restart|status|logs|enable|disable}"
    echo ""
    echo "Commands:"
    echo "  start   - Start the Metro Bistro UI service"
    echo "  stop    - Stop the Metro Bistro UI service"
    echo "  restart - Restart the Metro Bistro UI service"
    echo "  status  - Show service status"
    echo "  logs    - Show service logs (follow mode)"
    echo "  enable  - Enable service to start on boot"
    echo "  disable - Disable service from starting on boot"
    echo ""
}

case "$1" in
    start)
        echo "Starting Metro Bistro UI service..."
        sudo systemctl start "$SERVICE_NAME"
        echo "Service started. Check status with: $0 status"
        ;;
    stop)
        echo "Stopping Metro Bistro UI service..."
        sudo systemctl stop "$SERVICE_NAME"
        echo "Service stopped."
        ;;
    restart)
        echo "Restarting Metro Bistro UI service..."
        sudo systemctl restart "$SERVICE_NAME"
        echo "Service restarted. Check status with: $0 status"
        ;;
    status)
        echo "Metro Bistro UI service status:"
        sudo systemctl status "$SERVICE_NAME" --no-pager
        ;;
    logs)
        echo "Showing Metro Bistro UI logs (press Ctrl+C to exit):"
        sudo journalctl -u "$SERVICE_NAME" -f
        ;;
    enable)
        echo "Enabling Metro Bistro UI service to start on boot..."
        sudo systemctl enable "$SERVICE_NAME"
        echo "Service enabled."
        ;;
    disable)
        echo "Disabling Metro Bistro UI service from starting on boot..."
        sudo systemctl disable "$SERVICE_NAME"
        echo "Service disabled."
        ;;
    *)
        show_usage
        exit 1
        ;;
esac 