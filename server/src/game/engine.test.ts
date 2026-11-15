import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine, GameError, type RoomSettings } from './engine';
import { InMemoryRoomStateStore } from '../state/roomStateStore';

const settings:RoomSettings={name:'Test room',visibility:'private',password:'draw safely',maxPlayers:4,rounds:1,roundSeconds:30,difficulty:'mixed',wordMode:'all',customWords:[]};
const host={userId:'host-1',username:'Host',avatarId:'av-01'};const guest={userId:'guest-1',username:'Guest',avatarId:'av-02'};
test('room lifecycle enforces password, host, readiness, and offered words',async()=>{
 const game=new GameEngine(()=>1000);const room=await game.createRoom(host,settings,'socket-host');
 await assert.rejects(()=>game.join(room.code,guest,'socket-guest','wrong'),GameError);await game.join(room.code,guest,'socket-guest','draw safely');
 await assert.rejects(()=>game.start(room.code,guest.userId),(e:GameError)=>e.code==='NOT_HOST');
 assert.equal((await game.get(room.code)).players.get(guest.userId)?.ready,true);
 await game.setReady(room.code,guest.userId,false);await assert.rejects(()=>game.start(room.code,host.userId),(e:GameError)=>e.code==='PLAYERS_NOT_READY');
 await game.setReady(room.code,guest.userId,true);const started=await game.start(room.code,host.userId);await game.setWordChoices(room.code,started.drawer.userId,[{id:'w1',word:'otter',category:'animal'},{id:'w2',word:'bridge',category:'place'}]);
 await assert.rejects(()=>game.chooseWord(room.code,started.drawer.userId,'invalid'),(e:GameError)=>e.code==='INVALID_WORD');await game.chooseWord(room.code,started.drawer.userId,'w1');
 assert.equal(JSON.stringify(game.publicRoom(await game.get(room.code))).includes('otter'),false);assert.equal(JSON.stringify(game.publicRoom(await game.get(room.code),started.drawer.userId)).includes('otter'),false);
});
test('scoring, deadlines, and drawing authorization are enforced atomically',async()=>{
 let now=5000;const game=new GameEngine(()=>now);const room=await game.createRoom(host,{...settings,visibility:'public',password:undefined},'s1');
 await game.join(room.code,guest,'s2');await game.setReady(room.code,guest.userId,true);const {drawer}=await game.start(room.code,host.userId);
 await game.setWordChoices(room.code,drawer.userId,[{id:'w',word:'blue whale',category:'animal'},{id:'w2',word:'red fox',category:'animal'}]);await game.chooseWord(room.code,drawer.userId,'w');
 await assert.rejects(()=>game.guess(room.code,drawer.userId,'blue whale'),(e:GameError)=>e.code==='NOT_DRAWER');const guesser=drawer.userId===host.userId?guest:host;
 assert.equal((await game.guess(room.code,guesser.userId,'wrong')).correct,false);const correct=await game.guess(room.code,guesser.userId,'BLUE-WHALE');assert.equal(correct.correct,true);assert.ok(correct.points>0);assert.equal(correct.roundEnded,true);assert.equal((await game.get(room.code)).status,'round_end');
 await assert.rejects(()=>game.start(room.code,host.userId),(e:GameError)=>e.code==='ROOM_STARTED');
 const second=await game.createRoom(host,{...settings,visibility:'public',password:undefined},'s3');await game.join(second.code,guest,'s4');await game.setReady(second.code,guest.userId,true);const draw=(await game.start(second.code,host.userId)).drawer;
 await game.setWordChoices(second.code,draw.userId,[{id:'a',word:'apple',category:'food'},{id:'b',word:'pear',category:'food'}]);await game.chooseWord(second.code,draw.userId,'a');now+=31_000;
 await assert.rejects(()=>game.guess(second.code,draw.userId===host.userId?guest.userId:host.userId,'apple'),(e:GameError)=>e.code==='ROUND_EXPIRED');assert.equal((await game.get(second.code)).status,'round_end');
});
test('undo/redo and host migration survive shared-state reloads',async()=>{
 const store=new InMemoryRoomStateStore();const gameA=new GameEngine(()=>10_000,store);const gameB=new GameEngine(()=>10_000,store);
 const room=await gameA.createRoom(host,{...settings,visibility:'public',password:undefined},'host-socket');await gameB.join(room.code,guest,'guest-socket');await gameA.setReady(room.code,guest.userId,true);const drawer=(await gameB.start(room.code,host.userId)).drawer;
 await gameA.setWordChoices(room.code,drawer.userId,[{id:'1',word:'tree',category:'nature'},{id:'2',word:'bird',category:'animal'}]);await gameB.chooseWord(room.code,drawer.userId,'1');
 const stroke={id:'stroke-1',tool:'pen' as const,color:'#111111',size:4,points:[{x:.1,y:.2}]};await gameA.addStroke(room.code,drawer.userId,stroke);assert.equal((gameB.publicRoom(await gameB.get(room.code)).strokes as unknown[]).length,1);
 await gameB.replaceStrokes(room.code,drawer.userId,'undo');assert.equal((gameA.publicRoom(await gameA.get(room.code)).strokes as unknown[]).length,0);await gameA.replaceStrokes(room.code,drawer.userId,'redo');assert.equal((gameB.publicRoom(await gameB.get(room.code)).strokes as unknown[]).length,1);
 const left=await gameA.leave(room.code,host.userId);assert.equal(left?.hostUserId,guest.userId);
});
test('concurrent starts and correct guesses cannot score twice',async()=>{
 const store=new InMemoryRoomStateStore();const a=new GameEngine(Date.now,store);const b=new GameEngine(Date.now,store);const room=await a.createRoom(host,{...settings,visibility:'public',password:undefined},'h');await a.join(room.code,guest,'g');await a.setReady(room.code,guest.userId,true);
 const starts=await Promise.allSettled([a.start(room.code,host.userId),b.start(room.code,host.userId)]);assert.equal(starts.filter(x=>x.status==='fulfilled').length,1);
 const drawer=(starts.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof a.start>>>).value.drawer;
 await a.setWordChoices(room.code,drawer.userId,[{id:'x',word:'tree',category:'nature'},{id:'y',word:'bird',category:'animal'}]);await a.chooseWord(room.code,drawer.userId,'x');const guesser=drawer.userId===host.userId?guest:host;
 const results=await Promise.allSettled([a.guess(room.code,guesser.userId,'tree'),b.guess(room.code,guesser.userId,'tree')]);assert.equal(results.filter(x=>x.status==='fulfilled'&&x.value.correct).length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);const scored=results.find(x=>x.status==='fulfilled'&&x.value.correct);assert.equal((await a.get(room.code)).players.get(guesser.userId)?.score,scored?.status==='fulfilled'?scored.value.points:0);
});
test('reconnection replaces stale sockets and room expiry prunes abandoned rooms',async()=>{
 let now=10_000;const store=new InMemoryRoomStateStore();const game=new GameEngine(()=>now,store,2);const room=await game.createRoom(host,{...settings,visibility:'public',password:undefined},'old-socket');
 const reconnected=await game.join(room.code,host,'new-socket');assert.equal(reconnected.reconnected,true);const stale=await game.disconnect(room.code,host.userId,'old-socket');assert.equal(stale.disconnected,false);assert.equal((await game.get(room.code)).players.get(host.userId)?.connected,true);await assert.rejects(()=>game.setReady(room.code,host.userId,false,'old-socket'),(e:GameError)=>e.code==='STALE_SOCKET');
 now+=3_000;await assert.rejects(()=>game.get(room.code),(e:GameError)=>e.code==='ROOM_NOT_FOUND');
});
test('round transitions clear the drawing buffer and stale-turn strokes are rejected',async()=>{
 const game=new GameEngine(()=>10_000);const room=await game.createRoom(host,{...settings,rounds:2,visibility:'public',password:undefined},'h');
 await game.join(room.code,guest,'g');await game.setReady(room.code,guest.userId,true);const {drawer}=await game.start(room.code,host.userId);
 await game.setWordChoices(room.code,drawer.userId,[{id:'w1',word:'apple',category:'food'},{id:'w2',word:'pear',category:'food'}]);await game.chooseWord(room.code,drawer.userId,'w1');
 assert.equal((await game.get(room.code)).turnId,1);
 const stroke={id:'s1',tool:'pen' as const,color:'#111111',size:4,points:[{x:.1,y:.2}]};
 await game.addStroke(room.code,drawer.userId,stroke,undefined,1);assert.equal((await game.get(room.code)).strokes.length,1);
 await assert.rejects(()=>game.addStroke(room.code,drawer.userId,stroke,undefined,0),(e:GameError)=>e.code==='STALE_TURN');
 await game.endRound(room.code);const ended=await game.get(room.code);assert.equal(ended.status,'round_end');assert.equal(ended.strokes.length,0);assert.equal(ended.undo.length,0);assert.equal(game.publicRoom(ended).turnId,1);
 const next=await game.nextRound(room.code,host.userId);assert.equal(next.room.status,'choosing');assert.equal(next.room.strokes.length,0);
 await game.setWordChoices(room.code,next.drawer.userId,[{id:'a',word:'tree',category:'nature'},{id:'b',word:'bird',category:'animal'}]);await game.chooseWord(room.code,next.drawer.userId,'a');
 const round2=await game.get(room.code);assert.equal(round2.turnId,2);assert.equal(round2.strokes.length,0);
 await assert.rejects(()=>game.addStroke(room.code,next.drawer.userId,stroke,undefined,1),(e:GameError)=>e.code==='STALE_TURN');
 await game.addStroke(room.code,next.drawer.userId,stroke,undefined,2);assert.equal((await game.get(room.code)).strokes.length,1);
});
