import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRoomStateStore, RedisRoomStateStore } from './roomStateStore';

test('memory room store copies state and tracks room presence',async()=>{
  const store=new InMemoryRoomStateStore();const value={players:['p1']};await store.set('r1',value,60);value.players.push('p2');
  assert.deepEqual(await store.get('r1'),{players:['p1']});await store.touchPresence('r1','p1',60);await store.touchPresence('r1','p2',60);assert.deepEqual((await store.listPresence('r1')).sort(),['p1','p2']);
});
test('Redis adapter serializes state and uses TTL and presence keys',async()=>{
  const values=new Map<string,string>();const sets=new Map<string,Set<string>>();
  const client={async get(k:string){return values.get(k)||null;},async set(k:string,v:string){values.set(k,v);return 'OK';},async del(k:string){values.delete(k);return 1;},async sadd(k:string,v:string){const s=sets.get(k)||new Set();s.add(v);sets.set(k,s);return 1;},async expire(){return true;},async smembers(k:string){return [...(sets.get(k)||[])];},async srem(k:string,v:string){sets.get(k)?.delete(v);return 1;},async eval(_script:string,{keys,arguments:args}:{keys:string[];arguments:string[]}){if(values.get(keys[0])===args[0])values.delete(keys[0]);return 1;},async ping(){return 'PONG';}};
  const store=new RedisRoomStateStore(client);await store.set('room:A',{status:'drawing'},30);assert.deepEqual(await store.get('room:A'),{status:'drawing'});await store.touchPresence('A','u1',30);assert.deepEqual(await store.listPresence('A'),['u1']);
});
