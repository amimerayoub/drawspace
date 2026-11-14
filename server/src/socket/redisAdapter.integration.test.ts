import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as clientIo } from 'socket.io-client';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

const redisUrl=process.env.REDIS_TEST_URL;
test('two Socket.IO nodes broadcast to sockets joined on the other node (isolated local Redis)',{skip:!redisUrl?'Set REDIS_TEST_URL to an isolated localhost Redis instance to run this integration test.':false},async()=>{
  const parsed=new URL(redisUrl!);assert.ok(['localhost','127.0.0.1','::1'].includes(parsed.hostname),'REDIS_TEST_URL must target localhost; production Redis is not allowed in tests.');
  const pubA=new Redis(redisUrl!,{lazyConnect:true});const subA=pubA.duplicate({lazyConnect:true});const pubB=new Redis(redisUrl!,{lazyConnect:true});const subB=pubB.duplicate({lazyConnect:true});
  await Promise.all([pubA.connect(),subA.connect(),pubB.connect(),subB.connect()]);
  const httpA=createServer();const httpB=createServer();const a=new Server(httpA);const b=new Server(httpB);a.adapter(createAdapter(pubA,subA));b.adapter(createAdapter(pubB,subB));
  a.on('connection',socket=>socket.on('subscribe-test',async(room:string,ack:()=>void)=>{await socket.join(room);ack();}));b.on('connection',socket=>socket.on('subscribe-test',async(room:string,ack:()=>void)=>{await socket.join(room);ack();}));
  httpA.listen(0,'127.0.0.1');httpB.listen(0,'127.0.0.1');await Promise.all([once(httpA,'listening'),once(httpB,'listening')]);
  const portA=(httpA.address() as {port:number}).port;const portB=(httpB.address() as {port:number}).port;
  const clientA=clientIo(`http://127.0.0.1:${portA}`,{transports:['websocket']});const clientB=clientIo(`http://127.0.0.1:${portB}`,{transports:['websocket']});
  try {
    await Promise.all([new Promise<void>(resolve=>clientA.on('connect',()=>resolve())),new Promise<void>(resolve=>clientB.on('connect',()=>resolve()))]);await new Promise<void>(resolve=>clientB.emit('subscribe-test','multi-node-room',resolve));
    const received=new Promise<unknown>(resolve=>clientB.once('cross-node',resolve));a.to('multi-node-room').emit('cross-node',{ok:true});const payload=await received;assert.deepEqual(payload,{ok:true});
    clientB.disconnect();const reconnected=new Promise<void>(resolve=>clientB.once('connect',()=>resolve()));clientB.connect();await reconnected;
    await new Promise<void>(resolve=>clientB.emit('subscribe-test','multi-node-room',resolve));
    const afterReconnect=new Promise<unknown>(resolve=>clientB.once('cross-node',resolve));a.to('multi-node-room').emit('cross-node',{ok:'reconnected'});assert.deepEqual(await afterReconnect,{ok:'reconnected'});
  } finally {
    clientA.disconnect();clientB.disconnect();await Promise.all([new Promise<void>(resolve=>a.close(()=>resolve())),new Promise<void>(resolve=>b.close(()=>resolve()))]);
    await Promise.allSettled([pubA.quit(),subA.quit(),pubB.quit(),subB.quit()]);
  }
});
