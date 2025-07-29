# AI Server Systemd Service Setup

This directory contains everything needed to run the AI server as a systemd service, allowing it to start automatically on boot and restart if it crashes.

## Files

- `ai-server.service` - The systemd service definition
- `install-service.sh` - Script to install the service
- `manage-service.sh` - Script to manage the service (start/stop/restart/etc.)

## Installation

1. **Install the service:**
   ```bash
   sudo ./install-service.sh
   ```

2. **Start the service:**
   ```bash
   ./manage-service.sh start
   ```

3. **Check the status:**
   ```bash
   ./manage-service.sh status
   ```

## Service Management

Use the `manage-service.sh` script for all service operations:

```bash
# Start the service
./manage-service.sh start

# Stop the service
./manage-service.sh stop

# Restart the service
./manage-service.sh restart

# Check service status
./manage-service.sh status

# View logs (follow mode)
./manage-service.sh logs

# Enable service to start on boot
./manage-service.sh enable

# Disable service from starting on boot
./manage-service.sh disable
```

## Service Details

- **Service Name:** `ai-server`
- **Working Directory:** `/home/tsangc1/Projects/recipe/ai_service`
- **User:** `tsangc1`
- **Port:** `8000`
- **Host:** `0.0.0.0` (accessible from any IP)
- **Auto-restart:** Yes (10 seconds after crash)

## Environment Variables

If you need to set environment variables (like API keys), edit the service file:

```bash
sudo nano /etc/systemd/system/ai-server.service
```

Add environment variables in the `[Service]` section:

```ini
Environment=HUGGINGFACE_HUB_TOKEN=your_token_here
Environment=OTHER_VAR=value
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
./manage-service.sh restart
```

## Logs

View service logs with:

```bash
# Follow logs in real-time
./manage-service.sh logs

# Or use journalctl directly
sudo journalctl -u ai-server -f
```

## Development Workflow

Since the service runs from the current directory, you can:

1. **Modify code** in the `ai_service` directory
2. **Restart the service** to apply changes:
   ```bash
   ./manage-service.sh restart
   ```

The service will automatically restart if it crashes, and you can modify the code at any time without affecting the running service until you restart it.

## Troubleshooting

1. **Check service status:**
   ```bash
   ./manage-service.sh status
   ```

2. **View logs for errors:**
   ```bash
   ./manage-service.sh logs
   ```

3. **Test the API manually:**
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"question": "How do I make pasta?"}'
   ```

4. **Reinstall the service if needed:**
   ```bash
   sudo systemctl disable ai-server
   sudo rm /etc/systemd/system/ai-server.service
   sudo systemctl daemon-reload
   sudo ./install-service.sh
   ``` 