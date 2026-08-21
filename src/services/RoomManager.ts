import { Room } from '../models/Room';

export class RoomManager {
  private rooms: Map<string, Room>;

  constructor() {
    this.rooms = new Map();
  }

  public createRoom(roomId: string, password?: string): Room {
    if (this.rooms.has(roomId)) {
      throw new Error('Room already exists');
    }
    const room = new Room(roomId, password);
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getOrCreateRoom(roomId: string, password?: string): Room {
    let room = this.getRoom(roomId);
    if (!room) {
      room = this.createRoom(roomId, password);
    }
    return room;
  }

  public deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
  }
}
