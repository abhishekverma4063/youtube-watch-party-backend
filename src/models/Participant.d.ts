import { Role, UserData } from '../types';
export declare class Participant {
    id: string;
    username: string;
    role: Role;
    constructor(id: string, username: string, role: Role);
    toJSON(): UserData;
    setRole(role: Role): void;
}
//# sourceMappingURL=Participant.d.ts.map