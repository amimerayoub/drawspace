import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { createAppwriteDatabase } from './database/appwrite';
import { createSocketHandlers } from './socket/handlers';
import { createClient } from 'redis';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { InMemoryRoomStateStore, RedisRoomStateStore, type RedisRoomClient } from './state/roomStateStore';

async function main() {
  const config = loadConfig();
  const database = createAppwriteDatabase(config);
  const stateStore = config.roomStateDriver === 'redis' ? await connectRedis(config.redisUrl) : new InMemoryRoomStateStore();
  const { app, game, verify, repositories } = createApp({ config, database, roomStateStore: stateStore });
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: config.frontendOrigins, credentials: true },
    maxHttpBufferSize: 256 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });
  if (stateStore instanceof RedisRoomStateStore) {
    const redis = stateStore.runtime!;
    io.adapter(createAdapter(redis.pub as never, redis.sub as never));
    io.engine.on('connection_error', () => console.error('[socket.io] connection error'));
  }
  await createSocketHandlers(io, { verify, game, profiles: repositories.profiles, wordsDatabase: database, gameSettings: repositories.gameSettings, stateStore });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, '0.0.0.0', resolve);
  });
  console.info(`[server] listening on port ${config.port}`);

  const shutdown = () => {
    io.close();
    if(stateStore instanceof RedisRoomStateStore&&stateStore.runtime)void Promise.allSettled([stateStore.runtime.client.quit?.(),stateStore.runtime.pub.quit?.(),stateStore.runtime.sub.quit?.()]);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function connectRedis(url?: string): Promise<RedisRoomStateStore> {
  if (!url) throw new Error('REDIS_URL is required for ROOM_STATE_DRIVER=redis.');
  const client=createClient({url});const pub=new Redis(url,{lazyConnect:true});const sub=pub.duplicate({lazyConnect:true});
  client.on('error',()=>console.error('[redis] room-state connection error'));pub.on('error',()=>console.error('[redis] Socket.IO publisher error'));sub.on('error',()=>console.error('[redis] Socket.IO subscriber error'));
  try { await Promise.all([client.connect(),pub.connect(),sub.connect()]); await Promise.all([client.ping(),pub.ping(),sub.ping()]); }
  catch { await Promise.allSettled([client.quit(),pub.quit(),sub.quit()]); throw new Error('Redis startup connection failed; no memory fallback was attempted.'); }
  return new RedisRoomStateStore(asRoomClient(client),undefined,{client:asRoomClient(client),pub,sub});
}

function asRoomClient(client:any):RedisRoomClient {
  return {
    get:key=>client.get(key),
    set:(key,value,options)=>client.set(key,value,options as never),
    del:key=>client.del(key),
    sadd:(key,member)=>client.sAdd(key,member),
    expire:async(key,seconds)=>Boolean(await client.expire(key,seconds)),
    smembers:key=>client.sMembers(key),
    srem:(key,member)=>client.sRem(key,member),
    eval:(script,options)=>client.eval(script,options),
    ping:()=>client.ping(),
    get isOpen(){return client.isOpen;},
    quit:()=>client.quit(),
  };
}

main().catch((error: unknown) => {
  console.error('[startup-error]', error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
});
