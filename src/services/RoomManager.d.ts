import { Room } from '../models/Room';
export declare class RoomManager {
    private rooms;
    constructor();
    createRoom(roomId: string, password?: string): Room;
    getRoom(roomId: string): Room | undefined;
    getOrCreateRoom(roomId: string, password?: string): Room;
    deleteRoom(roomId: string): void;
}
//# sourceMappingURL=RoomManager.d.ts.map