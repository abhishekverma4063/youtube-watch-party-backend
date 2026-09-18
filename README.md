<div align="center">
  <img src="https://img.icons8.com/nolan/96/server.png" alt="Backend Logo">
  <h1 align="center">YouTube Watch Party - Backend</h1>
  <p align="center">
    <strong>The real-time WebSocket and API server powering the Watch Party experience.</strong>
  </p>
</div>

---

## 🚀 Overview
A robust Node.js backend utilizing Express and Socket.io to manage real-time video synchronization, chat rooms, and user authentication. It uses Prisma ORM connected to a PostgreSQL database to securely store user data and session logs.

## 💻 Tech Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Real-time Communication:** Socket.io
- **Database ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT (JSON Web Tokens) & bcrypt
- **Deployment:** Railway

## 🏗️ Architecture
- **REST API:** Handles secure user authentication (`/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`) utilizing HTTP-only cookies.
- **WebSocket Server:** The core engine that manages rooms, participant roles (Host vs Participant), video state syncing (Play, Pause, Seek), and live chat messages. 
- **Room Manager Service:** An in-memory class (`RoomManager`) that efficiently handles current active rooms, keeping track of participant counts, waiting lists, and active video timestamps.
- **Security:** Cross-Origin Resource Sharing (CORS) is strictly configured to only allow connections from the verified Vercel frontend, while gracefully handling cookie transmissions.

## 🔌 Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add:
```env
DATABASE_URL="postgresql://your_db_user:your_db_password@localhost:5432/your_db_name"
JWT_SECRET="your_super_secret_key"
```

### 3. Setup Database
```bash
npx prisma db push
```

### 4. Run the Development Server
```bash
npm run dev
```

> **Note:** The backend API and WebSocket server runs on **Port 3001** by default (`http://localhost:3001`).

## 🌟 Key Features
- **Stateless Authentication:** JWT validation seamlessly integrated into the Socket.io handshake middleware.
- **Auto-Cleanup:** Rooms automatically clean themselves up and purge from memory when the last participant leaves, saving bandwidth and memory.
- **Session Logging:** When a room closes, the entire session history (who joined, how long they stayed) is saved to the PostgreSQL database for analytics.
- **WebRTC Ready:** Pre-built signaling events to support future peer-to-peer audio/video chat integrations.
