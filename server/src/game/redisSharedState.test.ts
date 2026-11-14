import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine, type RoomSettings } from './engine';
import { RedisRoomStateStore } from '../state/roomStateStore';

class FakeRedisBackend { values=new Map<string,string>();sets=new Map<string,Set<string>>();expires=new Map<string,number>(); }
class FakeRedisClient {
 constructor(private backend:FakeRedisBackend){}
 async get(k:string){const expiry=this.backend.expires.get(k);if(expiry&&expiry<=Date.now()){this.backend.values.delete(k);return null;}return this.backend.values.get(k)||null;}
 async set(k:string,v:string,options:{EX?:number;PX?:number;NX?:true}={}){if(options.NX&&this.backend.values.has(k))return null;this.backend.values.set(k,v);if(options.EX)this.backend.expires.set(k,Date.now()+options.EX*1000);if(options.PX)this.backend.expires.set(k,Date.now()+options.PX);return 'OK';}
 async del(k:string){this.backend.values.delete(k);this.backend.expires.delete(k);return 1;}
 async sadd(k:string,v:string){const set=this.backend.sets.get(k)||new Set<string>();set.add(v);this.backend.sets.set(k,set);return 1;}
 async expire(k:string,s:number){this.backend.expires.set(k,Date.now()+s*1000);return true;}
 async smembers(k:string){return [...(this.backend.sets.get(k)||[])];}
 async srem(k:string,v:string){this.backend.sets.get(k)?.delete(v);return 1;}
 async eval(_script:string,{keys,arguments:args}:{keys:string[];arguments:string[]}){if(this.backend.values.get(keys[0])===args[0]){this.backend.values.delete(keys[0]);if(keys[1])this.backend.sets.get(keys[1])?.delete(args[1]);return 1;}return 0;}
 async ping(){return 'PONG';}
}
const settings:RoomSettings={name:'Redis test',visibility:'public',password:undefined,maxPlayers:4,rounds:2,roundSeconds:60,difficulty:'mixed',wordMode:'all',customWords:[]};
const host={userId:'host',username:'Host',avatarId:'av-01'};const player={userId:'player',username:'Player',avatarId:'av-02'};
test('two GameEngine instances use one Redis-compatible state backend',async()=>{
 const backend=new FakeRedisBackend();const store1=new RedisRoomStateStore(new FakeRedisClient(backend));const store2=new RedisRoomStateStore(new FakeRedisClient(backend));const one=new GameEngine(Date.now,store1);const two=new GameEngine(Date.now,store2);
 const room=await one.createRoom(host,settings,'socket-1');assert.equal((await two.get(room.code)).hostUserId,host.userId);await two.join(room.code,player,'socket-2');await one.setReady(room.code,player.userId,true);assert.equal((await two.get(room.code)).players.get(player.userId)?.ready,true);
 const simultaneous=await Promise.allSettled([one.start(room.code,host.userId),two.start(room.code,host.userId)]);assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1);
 const drawer=(simultaneous.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof one.start>>>).value.drawer;await one.setWordChoices(room.code,drawer.userId,[{id:'a',word:'tree',category:'nature'},{id:'b',word:'bird',category:'animal'}]);await two.chooseWord(room.code,drawer.userId,'a');const guesser=drawer.userId===host.userId?player:host;
 const guesses=await Promise.allSettled([one.guess(room.code,guesser.userId,'tree'),two.guess(room.code,guesser.userId,'tree')]);assert.equal(guesses.filter(x=>x.status==='fulfilled'&&x.value.correct).length,1);assert.equal(guesses.filter(x=>x.status==='rejected').length,1);
});
test('a new engine restores room state and reconciles expired player presence',async()=>{
 const backend=new FakeRedisBackend();const store1=new RedisRoomStateStore(new FakeRedisClient(backend));const store2=new RedisRoomStateStore(new FakeRedisClient(backend));const a=new GameEngine(Date.now,store1);const room=await a.createRoom(host,settings,'host-socket');await a.join(room.code,player,'player-socket');await a.setReady(room.code,player.userId,true);
 await store1.touchPresence(room.code,host.userId,45,'host-socket');await store1.touchPresence(room.code,player.userId,45,'player-socket');const restarted=new GameEngine(Date.now,store2);const restored=await restarted.recover();assert.equal(restored.length,1);assert.equal((await restarted.get(room.code)).players.get(player.userId)?.connected,true);
 await store1.removePresence(room.code,host.userId,'host-socket');await store1.removePresence(room.code,player.userId,'player-socket');const nextBoot=new GameEngine(Date.now,store1);await nextBoot.recover();assert.equal((await nextBoot.get(room.code)).players.get(host.userId)?.connected,false);
});
test('Redis outage fails state operations instead of falling back to process memory',async()=>{
 let online=true;const client=new FakeRedisClient(new FakeRedisBackend());const proxy=new Proxy(client,{get(target,key,receiver){if(!online&&['get','set','del','sadd','expire','smembers','srem','eval','ping'].includes(String(key)))return async()=>{throw new Error('offline');};return Reflect.get(target,key,receiver);}});
 const store=new RedisRoomStateStore(proxy);const engine=new GameEngine(Date.now,store);const room=await engine.createRoom(host,settings,'socket');online=false;await assert.rejects(()=>engine.get(room.code),/offline/);assert.equal(await store.isHealthy(),false);
});
