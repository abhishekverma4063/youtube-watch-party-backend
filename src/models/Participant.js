"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Participant = void 0;
const types_1 = require("../types");
class Participant {
    id;
    username;
    role;
    isAFK;
    joinTime;
    socketCount;
    constructor(id, username, role = types_1.Role.Participant) {
        this.id = id;
        this.username = username;
        this.role = role;
        this.isAFK = false;
        this.joinTime = Date.now();
        this.socketCount = 1;
    }
    toJSON() {
        return {
            userId: this.id,
            username: this.username,
            role: this.role,
            isAFK: this.isAFK,
            joinTime: this.joinTime,
        };
    }
    setRole(role) {
        this.role = role;
    }
}
exports.Participant = Participant;
//# sourceMappingURL=Participant.js.map