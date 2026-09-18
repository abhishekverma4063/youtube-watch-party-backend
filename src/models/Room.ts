import { Participant } from './Participant';
import { Role, VideoState, ChatMessage } from '../types';

export class Room {
  public id: string;
  public password?: string;
  public participants: Map<string, Participant>;
  public videoState: VideoState;
  public chatHistory: ChatMessage[];
  public isWaitingRoomEnabled: boolean;
  public waitingParticipants: Map<string, { userId: string; username: string }>;
  public sessionLogs: Map<string, { userId: string; username: string; joinTime: number; leaveTime?: number; totalDuration: number }>;

  constructor(id: string, password?: string) {
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

  public addParticipant(userId: string, username: string): Participant {
    if (this.participants.has(userId)) {
      const participant = this.participants.get(userId)!;
      participant.socketCount += 1;
      return participant;
    }
    
    // If first participant, make them host
    const isFirst = this.participants.size === 0;
    const role = isFirst ? Role.Host : Role.Participant;
    const participant = new Participant(userId, username, role);
    this.participants.set(userId, participant);
    
    // Add to session log
    if (!this.sessionLogs.has(userId)) {
      this.sessionLogs.set(userId, { userId, username, joinTime: participant.joinTime, totalDuration: 0 });
    } else {
      // If rejoining, update join time
      const log = this.sessionLogs.get(userId)!;
      log.joinTime = participant.joinTime;
      log.leaveTime = undefined;
    }
    
    return participant;
  }

  public removeParticipant(userId: string): Participant | undefined {
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

  public getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  public getAllParticipants(): ReturnType<Participant['toJSON']>[] {
    return Array.from(this.participants.values()).map(p => p.toJSON());
  }

  public getAllSessionLogs() {
    return Array.from(this.sessionLogs.values());
  }

  public updateVideoState(state: Partial<VideoState>) {
    this.videoState = { ...this.videoState, ...state, lastSyncTime: Date.now() };
  }

  public getTrueVideoState(): VideoState {
    const state = { ...this.videoState };
    if (state.isPlaying) {
      const elapsed = (Date.now() - state.lastSyncTime) / 1000;
      state.currentTime += elapsed;
      state.lastSyncTime = Date.now();
    }
    return state;
  }
  
  public addChatMessage(message: ChatMessage) {
    this.chatHistory.push(message);
    // Optional: limit chat history length
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
  }

  public canControlPlayback(userId: string): boolean {
    const participant = this.getParticipant(userId);
    return participant?.role === Role.Host || participant?.role === Role.Moderator;
  }

  public canManageRoles(userId: string): boolean {
    const participant = this.getParticipant(userId);
    return participant?.role === Role.Host;
  }
}
