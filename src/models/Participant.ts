import { Role, UserData } from '../types';

export class Participant {
  public id: string;
  public username: string;
  public role: Role;
  public isAFK: boolean;
  public joinTime: number;
  public socketCount: number;

  constructor(id: string, username: string, role: Role = Role.Participant) {
    this.id = id;
    this.username = username;
    this.role = role;
    this.isAFK = false;
    this.joinTime = Date.now();
    this.socketCount = 1;
  }

  public toJSON(): UserData {
    return {
      userId: this.id,
      username: this.username,
      role: this.role,
      isAFK: this.isAFK,
      joinTime: this.joinTime,
    };
  }

  public setRole(role: Role) {
    this.role = role;
  }
}
