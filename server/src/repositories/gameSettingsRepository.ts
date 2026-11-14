import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';
type Actor = { userId: string; username: string; role: string };
export interface GameSettings { maxPlayers: number; guessRateLimitPerMinute: number; chatRateLimitPerMinute: number; allowCustomWords: boolean }
export class GameSettingsRepository {
  private readonly rows: RowRepository; private readonly audit: RowRepository;
  constructor(db: AppwriteDatabase) { this.rows=new RowRepository(db,'platform_settings'); this.audit=new RowRepository(db,'audit_logs'); }
  async get(): Promise<GameSettings> { const row=(await this.rows.list([Query.limit(1)]))[0]; return { maxPlayers:Number(row?.maxRoomCapacity)||12, guessRateLimitPerMinute:Number(row?.guessRateLimitPerMinute)||60, chatRateLimitPerMinute:Number(row?.chatRateLimitPerMinute)||30, allowCustomWords:row?.allowCustomWords!==false }; }
  async update(next: GameSettings, actor: Actor) {
    const row=(await this.rows.list([Query.limit(1)]))[0]; const before=await this.get();
    if(row) await this.rows.patch(row.$id,{maxRoomCapacity:next.maxPlayers,guessRateLimitPerMinute:next.guessRateLimitPerMinute,chatRateLimitPerMinute:next.chatRateLimitPerMinute,allowCustomWords:next.allowCustomWords,updatedAt:new Date().toISOString(),updatedBy:actor.userId});
    else await this.rows.insert({platformName:'DrawSpace',platformDescription:'',publicSupportEmail:'support@drawspace.cloud',defaultLanguage:'en',registrationEnabled:true,guestAccessEnabled:true,maintenanceMode:false,emailVerificationRequired:false,maxRoomCapacity:next.maxPlayers,guessRateLimitPerMinute:next.guessRateLimitPerMinute,chatRateLimitPerMinute:next.chatRateLimitPerMinute,allowCustomWords:next.allowCustomWords,updatedAt:new Date().toISOString(),updatedBy:actor.userId});
    await this.audit.insert({id:`audit_${randomUUID()}`,actorUserId:actor.userId,actorUsername:actor.username.slice(0,32),actorRole:actor.role,action:'game_settings.update',ipAddress:'',resourceType:'platform_settings',resourceId:'singleton',status:'success',reason:`${JSON.stringify(before)} => ${JSON.stringify(next)}`.slice(0,255),createdAt:new Date().toISOString()});
    return next;
  }
}
