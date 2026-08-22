"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const RoomManager_1 = require("./services/RoomManager");
const types_1 = require("./types");
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.FRONTEND_URL) {
    // Allow multiple URLs if separated by commas
    const urls = process.env.FRONTEND_URL.split(',').map(u => u.trim());
    allowedOrigins.push(...urls);
}
const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use('/api/auth', auth_routes_1.default);
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: corsOptions,
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
    }
});
const roomManager = new RoomManager_1.RoomManager();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretwatchpartykey2026';
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        socket.data.userId = decoded.userId;
        socket.data.username = decoded.username;
        next();
    }
    catch (err) {
        next(new Error('Authentication error'));
    }
});
async function saveSessionLog(room) {
    if (room.sessionLogs.size === 0)
        return;
    try {
        await prisma.roomHistory.create({
            data: {
                roomId: room.id,
                startedAt: new Date(room.videoState.lastSyncTime || Date.now()), // approximate start
                totalUniqueUsers: room.sessionLogs.size,
                participants: {
                    create: Array.from(room.sessionLogs.values()).map((log) => ({
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
    }
    catch (err) {
        console.error('Failed to save session log', err);
    }
}
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    if (socket.data.userId) {
        socket.join(socket.data.userId); // Join personal room for targeted emits
    }
    socket.on('join_room', ({ roomId, password, isCreating }) => {
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
            const host = Array.from(room.participants.values()).find(p => p.role === types_1.Role.Host);
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
    socket.on('leave_room', ({ roomId }) => {
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
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.data.userId)) {
            room.updateVideoState({ isPlaying: true });
            io.to(roomId).emit('play', { senderId: socket.data.userId });
        }
    });
    socket.on('pause', () => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.data.userId)) {
            room.updateVideoState({ isPlaying: false });
            io.to(roomId).emit('pause', { senderId: socket.data.userId });
        }
    });
    socket.on('seek', ({ time }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.data.userId)) {
            room.updateVideoState({ currentTime: time });
            io.to(roomId).emit('seek', { time, senderId: socket.data.userId });
        }
    });
    socket.on('change_video', ({ videoId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.data.userId)) {
            room.updateVideoState({ videoId, isPlaying: false, currentTime: 0 });
            io.to(roomId).emit('change_video', { videoId }); // Broadcast to everyone including sender
        }
    });
    socket.on('sync_request', () => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room) {
            socket.emit('sync_state', { videoState: room.getTrueVideoState(), sessionLogs: room.getAllSessionLogs() });
        }
    });
    // Role Management
    socket.on('assign_role', ({ userId, role }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canManageRoles(socket.data.userId)) {
            const targetParticipant = room.getParticipant(userId);
            if (targetParticipant) {
                targetParticipant.setRole(role);
                // If Host transferred their role, demote them to Participant
                if (role === types_1.Role.Host && userId !== socket.data.userId) {
                    const currentHost = room.getParticipant(socket.data.userId);
                    if (currentHost) {
                        currentHost.setRole(types_1.Role.Participant);
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
    socket.on('remove_participant', ({ userId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
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
    socket.on('chat_message', ({ text }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room) {
            const participant = room.getParticipant(socket.data.userId);
            if (participant) {
                const message = {
                    id: (0, crypto_1.randomUUID)(),
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
    socket.on('reaction', ({ emoji }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
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
    socket.on('toggle_afk', ({ isAFK }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
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
    socket.on('toggle_waiting_room', ({ enabled }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canManageRoles(socket.data.userId)) {
            room.isWaitingRoomEnabled = enabled;
            io.to(roomId).emit('waiting_room_toggled', { enabled });
        }
    });
    socket.on('approve_join', ({ userId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
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
    socket.on('deny_join', ({ userId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
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
    socket.on('webrtc_offer', ({ targetId, offer }) => {
        io.to(targetId).emit('webrtc_offer', { senderId: socket.data.userId, offer });
    });
    socket.on('webrtc_answer', ({ targetId, answer }) => {
        io.to(targetId).emit('webrtc_answer', { senderId: socket.data.userId, answer });
    });
    socket.on('webrtc_ice_candidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('webrtc_ice_candidate', { senderId: socket.data.userId, candidate });
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map