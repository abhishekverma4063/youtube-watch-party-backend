"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const RoomManager_1 = require("./services/RoomManager");
const types_1 = require("./types");
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', auth_routes_1.default);
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*', // Allow all for MVP, restrict in production
        methods: ['GET', 'POST'],
    },
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
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.on('join_room', ({ roomId, password }) => {
        const username = socket.data.username;
        // Check password if room exists
        const existingRoom = roomManager.getRoom(roomId);
        if (existingRoom && existingRoom.password && existingRoom.password !== password) {
            socket.emit('error_message', { message: 'Incorrect room password' });
            return;
        }
        socket.join(roomId);
        socket.data.roomId = roomId;
        const room = roomManager.getOrCreateRoom(roomId, password);
        const participant = room.addParticipant(socket.id, username);
        // Notify others in room
        socket.to(roomId).emit('user_joined', {
            ...participant.toJSON(),
            participants: room.getAllParticipants(),
        });
        // Send current state to joined user
        socket.emit('sync_state', room.videoState);
        socket.emit('user_joined', {
            ...participant.toJSON(), // Need to send current user's role back as well
            participants: room.getAllParticipants(),
        });
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomId = socket.data.roomId;
        if (roomId) {
            const room = roomManager.getRoom(roomId);
            if (room) {
                const participant = room.removeParticipant(socket.id);
                if (participant) {
                    io.to(roomId).emit('user_left', {
                        userId: socket.id,
                        username: participant.username,
                        participants: room.getAllParticipants(),
                    });
                }
                // Clean up empty rooms
                if (room.participants.size === 0) {
                    roomManager.deleteRoom(roomId);
                }
            }
        }
    });
    // Playback Controls
    socket.on('play', () => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.id)) {
            room.updateVideoState({ isPlaying: true });
            io.to(roomId).emit('play');
        }
    });
    socket.on('pause', () => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.id)) {
            room.updateVideoState({ isPlaying: false });
            io.to(roomId).emit('pause');
        }
    });
    socket.on('seek', ({ time }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.id)) {
            room.updateVideoState({ currentTime: time });
            io.to(roomId).emit('seek', { time });
        }
    });
    socket.on('change_video', ({ videoId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canControlPlayback(socket.id)) {
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
            socket.emit('sync_state', room.videoState);
        }
    });
    // Role Management
    socket.on('assign_role', ({ userId, role }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canManageRoles(socket.id)) {
            const targetParticipant = room.getParticipant(userId);
            if (targetParticipant) {
                targetParticipant.setRole(role);
                io.to(roomId).emit('role_assigned', {
                    userId,
                    username: targetParticipant.username,
                    role,
                    participants: room.getAllParticipants(),
                });
            }
        }
    });
    socket.on('remove_participant', ({ userId }) => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        if (room && room.canManageRoles(socket.id)) {
            const removed = room.removeParticipant(userId);
            if (removed) {
                io.to(roomId).emit('participant_removed', {
                    userId,
                    participants: room.getAllParticipants(),
                });
                // Optionally force disconnect that user
                const targetSocket = io.sockets.sockets.get(userId);
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
            const participant = room.getParticipant(socket.id);
            if (participant) {
                const message = {
                    id: (0, crypto_1.randomUUID)(),
                    userId: socket.id,
                    username: participant.username,
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
            const participant = room.getParticipant(socket.id);
            if (participant) {
                io.to(roomId).emit('reaction', {
                    userId: socket.id,
                    username: participant.username,
                    emoji,
                });
            }
        }
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map