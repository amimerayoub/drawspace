import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './env';
const base:NodeJS.ProcessEnv={NODE_ENV:'test',APPWRITE_ENDPOINT:'https://appwrite.example/v1',APPWRITE_PROJECT_ID:'test-project',APPWRITE_API_KEY:'test-only'};
test('Redis driver requires a URL and never defaults to memory when selected',()=>{
 assert.throws(()=>loadConfig({...base,ROOM_STATE_DRIVER:'redis'}),/REDIS_URL/);
 const config=loadConfig({...base,ROOM_STATE_DRIVER:'redis',REDIS_URL:'redis://127.0.0.1:6379'});assert.equal(config.roomStateDriver,'redis');assert.equal(config.redisUrl,'redis://127.0.0.1:6379');
 assert.equal(loadConfig(base).roomStateDriver,'memory');
});
