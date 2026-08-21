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
    constructor(id, password) {
        this.id = id;
        this.password = password;
        this.participants = new Map();
        this.videoState = {
            videoId: '', // default empty or a specific video
            isPlaying: false,
            currentTime: 0,
            lastSyncTime: Date.now(),
        };
        this.chatHistory = [];
    }
    addParticipant(userId, username) {
        // If first participant, make them host
        const isFirst = this.participants.size === 0;
        const role = isFirst ? types_1.Role.Host : types_1.Role.Participant;
        const participant = new Participant_1.Participant(userId, username, role);
        this.participants.set(userId, participant);
        return participant;
    }
    removeParticipant(userId) {
        const participant = this.participants.get(userId);
        this.participants.delete(userId);
        // If host leaves, reassign host (optional feature, but good to have)
        if (participant?.role === types_1.Role.Host && this.participants.size > 0) {
            const nextParticipant = this.participants.values().next().value;
            if (nextParticipant) {
                nextParticipant.setRole(types_1.Role.Host);
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
    updateVideoState(state) {
        this.videoState = { ...this.videoState, ...state, lastSyncTime: Date.now() };
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