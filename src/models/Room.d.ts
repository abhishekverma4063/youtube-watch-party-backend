import { Participant } from './Participant';
import { VideoState, ChatMessage } from '../types';
export declare class Room {
    id: string;
    password?: string;
    participants: Map<string, Participant>;
    videoState: VideoState;
    chatHistory: ChatMessage[];
    isWaitingRoomEnabled: boolean;
    waitingParticipants: Map<string, {
        userId: string;
        username: string;
    }>;
    sessionLogs: Map<string, {
        userId: string;
        username: string;
        joinTime: number;
        leaveTime?: number;
        totalDuration: number;
    }>;
    constructor(id: string, password?: string);
    addParticipant(userId: string, username: string): Participant;
    removeParticipant(userId: string): Participant | undefined;
    getParticipant(userId: string): Participant | undefined;
    getAllParticipants(): ReturnType<Participant['toJSON']>[];
    getAllSessionLogs(): {
        userId: string;
        username: string;
        joinTime: number;
        leaveTime?: number;
        totalDuration: number;
    }[];
    updateVideoState(state: Partial<VideoState>): void;
    getTrueVideoState(): VideoState;
    addChatMessage(message: ChatMessage): void;
    canControlPlayback(userId: string): boolean;
    canManageRoles(userId: string): boolean;
}
//# sourceMappingURL=Room.d.ts.map