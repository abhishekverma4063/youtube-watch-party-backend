<div align="center">
  <img src="https://img.icons8.com/nolan/96/server.png" alt="Backend Logo">
  <h1 align="center">YouTube Watch Party - Backend</h1>
  <p align="center">
    <strong>The real-time WebSocket and API server powering the Watch Party experience.</strong>
  </p>
  <p align="center">
    <a href="https://youtube-watch-party-frontend-4utc.vercel.app/signup"><strong>🔗 View Live Application</strong></a>
  </p>
</div>

---

## 🚀 Project Overview
This is the backend server that drives the **YouTube Watch Party** ecosystem. It acts as the central hub for all users, built with **Node.js, Express, and Socket.io**. 

The server handles two major responsibilities:
1. **Authentication:** Uses secure HTTP-only cookies and JSON Web Tokens (JWT) to authenticate users during login/signup via REST APIs, storing data securely in a **PostgreSQL** database via **Prisma ORM**.
2. **Real-time Engine:** Manages a highly optimized WebSocket connection pool. When a host updates the video (plays, pauses, or seeks), the backend broadcasts that exact state to all other participants in the same room with millisecond latency. It also tracks analytics, such as when users join and leave, logging the entire session history to the database once a room closes.

## 📂 Project Structure
```text
backend/
├── prisma/
│   └── schema.prisma          # Database schema and models (User, RoomHistory, SessionLog)
├── src/
│   ├── models/                # Core business logic classes
│   │   ├── Participant.ts     # Represents a user inside a room (Role, AFK status)
│   │   └── Room.ts            # Manages video state, chat, and participants for a single room
│   ├── routes/                # Express REST API endpoints
│   │   └── auth.routes.ts     # Signup, Login, Refresh, and Logout routes
│   ├── services/
│   │   └── RoomManager.ts     # In-memory service managing active rooms globally
│   ├── types/                 # TypeScript interfaces and enums
│   │   └── index.ts           
│   └── index.ts               # Main server entry point (Express setup & Socket.io events)
```

## 💻 Tech Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Real-time Communication:** Socket.io
- **Database ORM:** Prisma
- **Database:** PostgreSQL (Neon Serverless)
- **Authentication:** JWT (JSON Web Tokens) & bcrypt
- **Deployment:** Render

## 🏗️ Architecture
- **REST API:** Handles secure user authentication utilizing HTTP-only cookies to prevent XSS attacks.
- **WebSocket Server:** The core engine that manages rooms, participant roles (Host vs Participant), video state syncing (Play, Pause, Seek), and live chat messages. 
- **In-Memory Management:** Instead of writing every live video timestamp to a database (which is slow and expensive), room data is held in-memory via `RoomManager` and only written to the database when the room closes (Session Logging).
- **Security:** Cross-Origin Resource Sharing (CORS) is strictly configured to only allow connections from the verified Vercel frontend, while gracefully handling cookie transmissions across domains.

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
