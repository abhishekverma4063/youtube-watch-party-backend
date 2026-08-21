"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const Room_1 = require("../models/Room");
class RoomManager {
    rooms;
    constructor() {
        this.rooms = new Map();
    }
    createRoom(roomId, password) {
        if (this.rooms.has(roomId)) {
            throw new Error('Room already exists');
        }
        const room = new Room_1.Room(roomId, password);
        this.rooms.set(roomId, room);
        return room;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getOrCreateRoom(roomId, password) {
        let room = this.getRoom(roomId);
        if (!room) {
            room = this.createRoom(roomId, password);
        }
        return room;
    }
    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }
}
exports.RoomManager = RoomManager;
//# sourceMappingURL=RoomManager.js.map