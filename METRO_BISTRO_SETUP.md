# Metro Bistro - Systemd Services Setup

This project has been rebranded to **Metro Bistro** and includes complete systemd service setup for all components.

## 🏗️ Architecture

Metro Bistro consists of three main services:

- **AI Server** (Port 8001) - AI-powered recipe chat and Q&A
- **Backend** (Port 8080) - Recipe management API and database
- **UI** (Port 4000) - React-based web interface

## 🚀 Quick Start

### 1. Install All Services
```bash
sudo ./install-metro-bistro.sh
```

### 2. Start All Services
```bash
./start-all-services.sh
```

### 3. Check Status
```bash
./check-all-services.sh
```

## 📁 Project Structure

```
/home/tsangc1/Projects/recipe/
├── ai_service/                    # AI Server
│   ├── ai-server.service         # Systemd service file
│   ├── install-service.sh        # Installation script
│   ├── manage-service.sh         # Management script
│   └── app.py                    # FastAPI application
├── backend/                      # Backend Server
│   ├── metro-bistro-backend.service
│   ├── install-backend-service.sh
│   ├── manage-backend.sh
│   └── src/                      # TypeScript source
├── web/                         # UI Server
│   ├── metro-bistro-ui.service
│   ├── install-ui-service.sh
│   ├── manage-ui.sh
│   ├── public/metro-bistro-icon.png
│   └── src/                     # React source
├── metro-bistro-icon.png        # App icon
├── install-metro-bistro.sh      # Master installer
├── start-all-services.sh        # Start all services
├── check-all-services.sh        # Check all status
└── stop-all-services.sh         # Stop all services
```

## 🔧 Individual Service Management

### AI Server
```bash
cd ai_service
./manage-service.sh {start|stop|restart|status|logs|enable|disable}
```

### Backend
```bash
cd backend
./manage-backend.sh {start|stop|restart|status|logs|enable|disable}
```

### UI
```bash
cd web
./manage-ui.sh {start|stop|restart|status|logs|enable|disable}
```

## 🌐 Service URLs

- **UI**: http://localhost:4000
- **Backend API**: http://localhost:8080
- **AI Server**: http://localhost:8001

## 🔑 Environment Variables

### AI Server (.env in ai_service/)
```bash
HUGGINGFACE_HUB_TOKEN=your_token_here
```

### Backend (edit service file)
```bash
# Edit /etc/systemd/system/metro-bistro-backend.service
Environment=DATABASE_URL=postgresql://user:password@localhost:5432/metro_bistro
Environment=JWT_SECRET=your_jwt_secret_here
```

### UI (edit service file)
```bash
# Edit /etc/systemd/system/metro-bistro-ui.service
Environment=VITE_API_URL=http://localhost:8080
```

## 🎨 Branding

- **App Name**: Metro Bistro
- **Icon**: `metro-bistro-icon.png` (converted from `image546.gif`)
- **Title**: "Metro Bistro - Recipe Management"
- **Header**: Shows Metro Bistro logo and title, clickable to go home
- **Translations**: Available in English and Chinese

## 📝 Service Dependencies

- **UI** depends on **Backend**
- **Backend** depends on **PostgreSQL**
- **AI Server** is independent

## 🔍 Troubleshooting

### Check Service Logs
```bash
# AI Server
sudo journalctl -u ai-server -f

# Backend
sudo journalctl -u metro-bistro-backend -f

# UI
sudo journalctl -u metro-bistro-ui -f
```

### Common Issues

1. **Port Conflicts**: Services use ports 4000, 8001, 8080
2. **Database Connection**: Ensure PostgreSQL is running
3. **Environment Variables**: Check .env files and service configurations
4. **Dependencies**: Run `npm install` in backend/ and web/ directories

### Reinstall Services
```bash
# Remove old services
sudo systemctl disable ai-server metro-bistro-backend metro-bistro-ui
sudo rm /etc/systemd/system/ai-server.service
sudo rm /etc/systemd/system/metro-bistro-backend.service
sudo rm /etc/systemd/system/metro-bistro-ui.service
sudo systemctl daemon-reload

# Reinstall
sudo ./install-metro-bistro.sh
```

## 🚀 Development Workflow

1. **Modify code** in respective directories
2. **Restart services** to apply changes:
   ```bash
   ./stop-all-services.sh
   ./start-all-services.sh
   ```

3. **Individual service restart**:
   ```bash
   cd backend && ./manage-backend.sh restart
   cd web && ./manage-ui.sh restart
   cd ai_service && ./manage-service.sh restart
   ```

## 📋 Service Details

### AI Server (metro-bistro-ai)
- **Port**: 8001
- **Technology**: FastAPI + Mistral-7B
- **Auto-restart**: Yes
- **Memory**: ~430MB (CPU mode)

### Backend (metro-bistro-backend)
- **Port**: 8080
- **Technology**: Node.js + Express + Prisma
- **Auto-restart**: Yes
- **Dependencies**: PostgreSQL

### UI (metro-bistro-ui)
- **Port**: 4000
- **Technology**: React + Vite
- **Auto-restart**: Yes
- **Dependencies**: Backend API

## 🎯 Next Steps

1. Configure database connection
2. Set up environment variables
3. Test all services
4. Configure reverse proxy (nginx) if needed
5. Set up SSL certificates for production 