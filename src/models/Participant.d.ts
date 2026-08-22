import { Role, UserData } from '../types';
export declare class Participant {
    id: string;
    username: string;
    role: Role;
    isAFK: boolean;
    joinTime: number;
    socketCount: number;
    constructor(id: string, username: string, role?: Role);
    toJSON(): UserData;
    setRole(role: Role): void;
}
//# sourceMappingURL=Participant.d.ts.map