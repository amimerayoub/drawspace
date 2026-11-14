import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export interface RoomStateStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  touchPresence(roomId: string, userId: string, ttlSeconds: number, socketId?: string): Promise<void>;
  removePresence(roomId: string, userId: string, socketId?: string): Promise<void>;
  listPresence(roomId: string): Promise<string[]>;
  withLock<T>(key: string, operation: () => Promise<T> | T): Promise<T>;
  isHealthy(): Promise<boolean>;
}

export class InMemoryRoomStateStore implements RoomStateStore {
  private values=new Map<string,{value:unknown;expiresAt:number}>();
  private presence=new Map<string,Map<string,{expiresAt:number;socketId:string}>>();
  private tails=new Map<string,Promise<void>>();
  async get<T>(key:string):Promise<T|null>{const item=this.values.get(key);if(!item)return null;if(item.expiresAt<=Date.now()){this.values.delete(key);return null;}return structuredClone(item.value) as T;}
  async set<T>(key:string,value:T,ttlSeconds:number){this.values.set(key,{value:structuredClone(value),expiresAt:Date.now()+ttlSeconds*1000});}
  async delete(key:string){this.values.delete(key);}
  async touchPresence(roomId:string,userId:string,ttlSeconds:number,socketId=''){const room=this.presence.get(roomId)||new Map();room.set(userId,{expiresAt:Date.now()+ttlSeconds*1000,socketId});this.presence.set(roomId,room);}
  async removePresence(roomId:string,userId:string,socketId?:string){const room=this.presence.get(roomId);const current=room?.get(userId);if(current&&(socketId===undefined||current.socketId===socketId))room!.delete(userId);}
  async listPresence(roomId:string){const room=this.presence.get(roomId);if(!room)return[];const now=Date.now();for(const [user,presence] of room)if(presence.expiresAt<=now)room.delete(user);if(!room.size)this.presence.delete(roomId);return [...room.keys()];}
  async withLock<T>(key:string,operation:()=>Promise<T>|T):Promise<T>{const previous=this.tails.get(key)||Promise.resolve();let release!:()=>void;const next=new Promise<void>(resolve=>{release=resolve;});this.tails.set(key,next);await previous;try{return await operation();}finally{release();if(this.tails.get(key)===next)this.tails.delete(key);}}
  async isHealthy(){return true;}
}

/** Minimal Redis v4/v5 client surface; clients are created from REDIS_URL at server startup. */
export interface RedisRoomClient {
  get(key:string):Promise<string|null>;
  set(key:string,value:string,options:{EX:number}|{PX:number;NX:true}):Promise<string|null>;
  del(key:string):Promise<number>;
  sadd(key:string,member:string):Promise<number>;
  expire(key:string,seconds:number):Promise<boolean>;
  smembers(key:string):Promise<string[]>;
  srem(key:string,member:string):Promise<number>;
  eval(script:string,options:{keys:string[];arguments:string[]}):Promise<unknown>;
  ping():Promise<string>;
  isOpen?:boolean;
  quit?():Promise<unknown>;
}
export interface RedisProbeClient { ping():Promise<unknown>; status?:string; quit?():Promise<unknown> }
export class RedisRoomStateStore implements RoomStateStore {
  constructor(private readonly client:RedisRoomClient,private readonly prefix='drawspace:room:',public readonly runtime?:{client:RedisRoomClient;pub:RedisProbeClient;sub:RedisProbeClient}){}
  async get<T>(key:string):Promise<T|null>{const raw=await this.client.get(`${this.prefix}state:${key}`);return raw===null?null:JSON.parse(raw) as T;}
  async set<T>(key:string,value:T,ttlSeconds:number){await this.client.set(`${this.prefix}state:${key}`,JSON.stringify(value),{EX:ttlSeconds});}
  async delete(key:string){await this.client.del(`${this.prefix}state:${key}`);}
  async touchPresence(roomId:string,userId:string,ttlSeconds:number,socketId=''){const index=`${this.prefix}presence:${roomId}`;await this.client.sadd(index,userId);await this.client.expire(index,ttlSeconds);await this.client.set(`${index}:${userId}`,socketId||'active',{EX:ttlSeconds});}
  async removePresence(roomId:string,userId:string,socketId?:string){const index=`${this.prefix}presence:${roomId}`;const memberKey=`${index}:${userId}`;if(socketId===undefined){await this.client.srem(index,userId);await this.client.del(memberKey);return;}await this.client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('del', KEYS[1]); redis.call('srem', KEYS[2], ARGV[2]); return 1 else return 0 end",{keys:[memberKey,index],arguments:[socketId,userId]});}
  async listPresence(roomId:string){const index=`${this.prefix}presence:${roomId}`;const users=await this.client.smembers(index);const active:string[]=[];for(const user of users){if(await this.client.get(`${index}:${user}`))active.push(user);else await this.client.srem(index,user);}return active;}
  async withLock<T>(key:string,operation:()=>Promise<T>|T):Promise<T>{
    const lockKey=`${this.prefix}lock:${key}`;const token=randomUUID();const deadline=Date.now()+10_000;
    while(await this.client.set(lockKey,token,{PX:10_000,NX:true})!=='OK'){if(Date.now()>=deadline)throw new Error('Timed out waiting for shared room state lock.');await delay(20+Math.floor(Math.random()*30));}
    let lost=false;let renewal:Promise<unknown>|undefined;
    const heartbeat=setInterval(()=>{renewal=this.client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], 10000) else return 0 end",{keys:[lockKey],arguments:[token]}).then(result=>{if(Number(result)!==1)lost=true;}).catch(()=>{lost=true;});},3_000);heartbeat.unref();
    try{const result=await operation();if(renewal)await renewal;if(lost)throw new Error('Shared room state lock was lost.');return result;}
    finally{clearInterval(heartbeat);await this.client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",{keys:[lockKey],arguments:[token]});}
  }
  async isHealthy(){try{if(this.client.isOpen===false||(await this.client.ping()).toUpperCase()!=='PONG')return false;if(this.runtime)for(const client of [this.runtime.pub,this.runtime.sub])if((client.status&&client.status!=='ready')||String(await client.ping()).toUpperCase()!=='PONG')return false;return true;}catch{return false;}}
}
