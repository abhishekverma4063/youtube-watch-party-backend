export declare enum Role {
    Host = "Host",
    Moderator = "Moderator",
    Participant = "Participant"
}
export interface UserData {
    userId: string;
    username: string;
    role: Role;
}
export interface VideoState {
    videoId: string;
    isPlaying: boolean;
    currentTime: number;
    lastSyncTime: number;
}
export interface ChatMessage {
    id: string;
    userId: string;
    username: string;
    text: string;
    timestamp: number;
}
//# sourceMappingURL=index.d.ts.map