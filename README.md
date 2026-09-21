# Inji Interoperability Playground - Startup Guide

Follow these step-by-step instructions to start the application.

### Prerequisites

- Node.js v18+ (tested with v24)
- npm v9+
- Docker & Docker Compose (ensure the Docker daemon is running on your host machine)

### Step 1: Install Dependencies
```bash
# Make sure you are in the project root directory
cd inji-playground

# Install all dependencies
npm install
```

### Step 2: Start the MOSIP Docker Services
```bash
# Navigate to the mosip-stack directory
cd mosip-stack

# Start the docker containers in the background
docker compose up -d

# Return to the project root directory
cd ..
```

### Step 3: Start the Application
You can run both the backend proxy server and the frontend application together using a single command:
```bash
npm run dev:all
```

*(Alternatively, if you prefer to use separate terminals)*:
- **Terminal 1 (Backend Proxy):** `npm run server`
- **Terminal 2 (Frontend App):** `npm run dev`

### Step 4: Access the Application
Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)
