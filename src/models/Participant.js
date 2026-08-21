"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Participant = void 0;
const types_1 = require("../types");
class Participant {
    id;
    username;
    role;
    constructor(id, username, role) {
        this.id = id;
        this.username = username;
        this.role = role;
    }
    toJSON() {
        return {
            userId: this.id,
            username: this.username,
            role: this.role,
        };
    }
    setRole(role) {
        this.role = role;
    }
}
exports.Participant = Participant;
//# sourceMappingURL=Participant.js.map