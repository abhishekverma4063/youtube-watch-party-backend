import { Participant } from './Participant';
import { VideoState, ChatMessage } from '../types';
export declare class Room {
    id: string;
    password?: string;
    participants: Map<string, Participant>;
    videoState: VideoState;
    chatHistory: ChatMessage[];
    constructor(id: string, password?: string);
    addParticipant(userId: string, username: string): Participant;
    removeParticipant(userId: string): Participant | undefined;
    getParticipant(userId: string): Participant | undefined;
    getAllParticipants(): ReturnType<Participant['toJSON']>[];
    updateVideoState(state: Partial<VideoState>): void;
    addChatMessage(message: ChatMessage): void;
    canControlPlayback(userId: string): boolean;
    canManageRoles(userId: string): boolean;
}
//# sourceMappingURL=Room.d.ts.map