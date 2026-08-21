import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { RoomManager } from './services/RoomManager';
import { Role } from './types';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.routes';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true })); // Needs explicit origin for credentials
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  }
});

const roomManager = new RoomManager();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretwatchpartykey2026';

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, username: string };
    socket.data.userId = decoded.userId;
    socket.data.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

async function saveSessionLog(room: any) {
  if (room.sessionLogs.size === 0) return;
  try {
    await prisma.roomHistory.create({
      data: {
        roomId: room.id,
        startedAt: new Date(room.videoState.lastSyncTime || Date.now()), // approximate start
        totalUniqueUsers: room.sessionLogs.size,
        participants: {
          create: Array.from(room.sessionLogs.values()).map((log: any) => ({
            userId: log.userId,
            username: log.username,
            joinTime: new Date(log.joinTime),
            leaveTime: log.leaveTime ? new Date(log.leaveTime) : new Date(),
            totalDuration: log.totalDuration || 0
          }))
        }
      }
    });
    console.log(`Saved session log for room ${room.id}`);
  } catch (err) {
    console.error('Failed to save session log', err);
  }
}

io.on('connection', (socket: Socket) => {
  console.log('User connected:', socket.id);
  if (socket.data.userId) {
    socket.join(socket.data.userId); // Join personal room for targeted emits
  }

  socket.on('join_room', ({ roomId, password, isCreating }: { roomId: string, password?: string, isCreating?: boolean }) => {
    const userId = socket.data.userId;
    const username = socket.data.username;
    
    const existingRoom = roomManager.getRoom(roomId);

    if (!isCreating && !existingRoom) {
      socket.emit('error_message', { message: 'Invalid room ID or room does not exist.' });
      return;
    }

    // Check password if room exists
    if (existingRoom && existingRoom.password && existingRoom.password !== password) {
      socket.emit('error_message', { message: 'Incorrect room password' });
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    const room = roomManager.getOrCreateRoom(roomId, password);

    // If waiting room is enabled and not host, put in waiting list
    if (room.isWaitingRoomEnabled && room.participants.size > 0) {
      room.waitingParticipants.set(userId, { userId, username });
      socket.emit('waiting_for_approval');
      
      // Notify host
      const host = Array.from(room.participants.values()).find(p => p.role === Role.Host);
      if (host) {
        io.to(host.id).emit('join_request', { userId, username });
      }
      return;
    }

    const participant = room.addParticipant(userId, username);

    // Send current state to joined user first
    socket.emit('sync_state', { videoState: room.getTrueVideoState(), sessionLogs: room.getAllSessionLogs(), isInitialJoin: true });

    // Broadcast joined event to everyone (including the user who just joined)
    io.to(roomId).emit('user_joined', {
      ...participant.toJSON(),
      participants: room.getAllParticipants(),
      sessionLogs: room.getAllSessionLogs(),
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;
    if (roomId && userId) {
      const room = roomManager.getRoom(roomId);
      if (room) {
        const participant = room.removeParticipant(userId);
        if (participant) {
          // Only emit user_left if they were actually removed (socketCount reached 0)
          if (!room.participants.has(userId)) {
            io.to(roomId).emit('user_left', {
              userId: userId,
              username: participant.username,
              participants: room.getAllParticipants(),
              sessionLogs: room.getAllSessionLogs(),
            });
          }
        }
        
        // Clean up empty rooms
        if (room.participants.size === 0) {
          saveSessionLog(room);
          roomManager.deleteRoom(roomId);
        }
      }
    }
  });

  socket.on('leave_room', ({ roomId }: { roomId: string }) => {
    const userId = socket.data.userId;
    const room = roomManager.getRoom(roomId);
    if (room && userId) {
      const participant = room.removeParticipant(userId);
      if (participant) {
        socket.leave(roomId);
        delete socket.data.roomId;
        
        if (!room.participants.has(userId)) {
          io.to(roomId).emit('user_left', {
            userId: userId,
            username: participant.username,
            participants: room.getAllParticipants(),
            sessionLogs: room.getAllSessionLogs(),
          });
        }
      }
      
      if (room.participants.size === 0) {
        saveSessionLog(room);
        roomManager.deleteRoom(roomId);
      }
    }
  });

  // Playback Controls
  socket.on('play', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canControlPlayback(socket.data.userId)) {
      room.updateVideoState({ isPlaying: true });
      io.to(roomId).emit('play', { senderId: socket.data.userId });
    }
  });

  socket.on('pause', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canControlPlayback(socket.data.userId)) {
      room.updateVideoState({ isPlaying: false });
      io.to(roomId).emit('pause', { senderId: socket.data.userId });
    }
  });

  socket.on('seek', ({ time }: { time: number }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canControlPlayback(socket.data.userId)) {
      room.updateVideoState({ currentTime: time });
      io.to(roomId).emit('seek', { time, senderId: socket.data.userId });
    }
  });

  socket.on('change_video', ({ videoId }: { videoId: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canControlPlayback(socket.data.userId)) {
      room.updateVideoState({ videoId, isPlaying: false, currentTime: 0 });
      io.to(roomId).emit('change_video', { videoId }); // Broadcast to everyone including sender
    }
  });
  
  socket.on('sync_request', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
        socket.emit('sync_state', { videoState: room.getTrueVideoState(), sessionLogs: room.getAllSessionLogs() });
    }
  });

  // Role Management
  socket.on('assign_role', ({ userId, role }: { userId: string; role: Role }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canManageRoles(socket.data.userId)) {
      const targetParticipant = room.getParticipant(userId);
      if (targetParticipant) {
        targetParticipant.setRole(role);
        
        // If Host transferred their role, demote them to Participant
        if (role === Role.Host && userId !== socket.data.userId) {
           const currentHost = room.getParticipant(socket.data.userId);
           if (currentHost) {
             currentHost.setRole(Role.Participant);
           }
        }
        
        // We broadcast to everyone so UI updates for everyone
        io.to(roomId).emit('role_assigned', {
          userId,
          username: targetParticipant.username,
          role,
          participants: room.getAllParticipants(),
          sessionLogs: room.getAllSessionLogs(),
        });
      }
    }
  });

  socket.on('remove_participant', ({ userId }: { userId: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canManageRoles(socket.data.userId)) {
      const removed = room.removeParticipant(userId);
      if (removed) {
        io.to(roomId).emit('participant_removed', {
          userId,
          participants: room.getAllParticipants(),
          sessionLogs: room.getAllSessionLogs(),
        });
        // Force disconnect that user
        const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userId === userId);
        if (targetSocket) {
          targetSocket.leave(roomId);
          targetSocket.emit('kicked_from_room');
        }
      }
    }
  });

  // Chat & Reactions (Bonus)
  socket.on('chat_message', ({ text }: { text: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
      const participant = room.getParticipant(socket.data.userId);
      if (participant) {
        const message = {
          id: randomUUID(),
          userId: socket.data.userId,
          username: participant.username,
          role: participant.role,
          text,
          timestamp: Date.now(),
        };
        room.addChatMessage(message);
        io.to(roomId).emit('chat_message', message);
      }
    }
  });

  socket.on('reaction', ({ emoji }: { emoji: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
      const participant = room.getParticipant(socket.data.userId);
      if (participant) {
        io.to(roomId).emit('reaction', {
          userId: socket.data.userId,
          username: participant.username,
          emoji,
        });
      }
    }
  });

  socket.on('ping_req', () => {
    socket.emit('pong_res');
  });

  // AFK & Waiting Room & STUN
  socket.on('toggle_afk', ({ isAFK }: { isAFK: boolean }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
      const participant = room.getParticipant(socket.data.userId);
      if (participant) {
        participant.isAFK = isAFK;
        io.to(roomId).emit('participant_updated', {
          userId: socket.data.userId,
          participants: room.getAllParticipants(),
          sessionLogs: room.getAllSessionLogs(),
        });
      }
    }
  });

  socket.on('toggle_waiting_room', ({ enabled }: { enabled: boolean }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canManageRoles(socket.data.userId)) {
      room.isWaitingRoomEnabled = enabled;
      io.to(roomId).emit('waiting_room_toggled', { enabled });
    }
  });

  socket.on('approve_join', ({ userId }: { userId: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canManageRoles(socket.data.userId)) {
      const waitingUser = room.waitingParticipants.get(userId);
      if (waitingUser) {
        room.waitingParticipants.delete(userId);
        const participant = room.addParticipant(userId, waitingUser.username);
        
        // Notify the approved user
        const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userId === userId);
        if (targetSocket) {
          targetSocket.join(roomId);
          targetSocket.data.roomId = roomId;
          targetSocket.emit('sync_state', { videoState: room.getTrueVideoState(), sessionLogs: room.getAllSessionLogs(), isInitialJoin: true });
          targetSocket.emit('user_joined', {
            ...participant.toJSON(),
            participants: room.getAllParticipants(),
            sessionLogs: room.getAllSessionLogs(),
          });
        }
        
        // Notify others
        socket.to(roomId).emit('user_joined', {
          ...participant.toJSON(),
          participants: room.getAllParticipants(),
          sessionLogs: room.getAllSessionLogs(),
        });
      }
    }
  });

  socket.on('deny_join', ({ userId }: { userId: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room && room.canManageRoles(socket.data.userId)) {
      room.waitingParticipants.delete(userId);
      const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userId === userId);
      if (targetSocket) {
        targetSocket.emit('join_denied');
      }
    }
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', ({ targetId, offer }: { targetId: string, offer: any }) => {
    io.to(targetId).emit('webrtc_offer', { senderId: socket.data.userId, offer });
  });

  socket.on('webrtc_answer', ({ targetId, answer }: { targetId: string, answer: any }) => {
    io.to(targetId).emit('webrtc_answer', { senderId: socket.data.userId, answer });
  });

  socket.on('webrtc_ice_candidate', ({ targetId, candidate }: { targetId: string, candidate: any }) => {
    io.to(targetId).emit('webrtc_ice_candidate', { senderId: socket.data.userId, candidate });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
