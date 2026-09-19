"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = void 0;
const Participant_1 = require("./Participant");
const types_1 = require("../types");
class Room {
    id;
    password;
    participants;
    videoState;
    chatHistory;
    isWaitingRoomEnabled;
    waitingParticipants;
    sessionLogs;
    constructor(id, password) {
        this.id = id;
        if (password) {
            this.password = password;
        }
        this.participants = new Map();
        this.videoState = {
            videoId: '', // default empty or a specific video
            isPlaying: false,
            currentTime: 0,
            lastSyncTime: Date.now(),
        };
        this.chatHistory = [];
        this.isWaitingRoomEnabled = false;
        this.waitingParticipants = new Map();
        this.sessionLogs = new Map();
    }
    addParticipant(userId, username) {
        if (this.participants.has(userId)) {
            const participant = this.participants.get(userId);
            participant.socketCount += 1;
            return participant;
        }
        // If first participant, make them host
        const isFirst = this.participants.size === 0;
        const role = isFirst ? types_1.Role.Host : types_1.Role.Participant;
        const participant = new Participant_1.Participant(userId, username, role);
        this.participants.set(userId, participant);
        // Add to session log
        if (!this.sessionLogs.has(userId)) {
            this.sessionLogs.set(userId, { userId, username, joinTime: participant.joinTime, totalDuration: 0 });
        }
        else {
            // If rejoining, update join time
            const log = this.sessionLogs.get(userId);
            log.joinTime = participant.joinTime;
            log.leaveTime = undefined;
        }
        return participant;
    }
    removeParticipant(userId) {
        const participant = this.participants.get(userId);
        if (participant) {
            participant.socketCount -= 1;
            if (participant.socketCount > 0) {
                // They still have other active sockets, don't remove them yet
                return participant;
            }
            // Zero sockets left, actually remove them
            this.participants.delete(userId);
            const log = this.sessionLogs.get(userId);
            if (log && !log.leaveTime) {
                log.leaveTime = Date.now();
                log.totalDuration += Math.floor((log.leaveTime - log.joinTime) / 1000);
            }
        }
        return participant;
    }
    getParticipant(userId) {
        return this.participants.get(userId);
    }
    getAllParticipants() {
        return Array.from(this.participants.values()).map(p => p.toJSON());
    }
    getAllSessionLogs() {
        return Array.from(this.sessionLogs.values());
    }
    updateVideoState(state) {
        this.videoState = { ...this.videoState, ...state, lastSyncTime: Date.now() };
    }
    getTrueVideoState() {
        const state = { ...this.videoState };
        if (state.isPlaying) {
            const elapsed = (Date.now() - state.lastSyncTime) / 1000;
            state.currentTime += elapsed;
            state.lastSyncTime = Date.now();
        }
        return state;
    }
    addChatMessage(message) {
        this.chatHistory.push(message);
        // Optional: limit chat history length
        if (this.chatHistory.length > 100) {
            this.chatHistory.shift();
        }
    }
    canControlPlayback(userId) {
        const participant = this.getParticipant(userId);
        return participant?.role === types_1.Role.Host || participant?.role === types_1.Role.Moderator;
    }
    canManageRoles(userId) {
        const participant = this.getParticipant(userId);
        return participant?.role === types_1.Role.Host;
    }
}
exports.Room = Room;
//# sourceMappingURL=Room.js.map