import assert from 'node:assert/strict';
import test from 'node:test';
import { gameSettingsSchema } from './gameSettingsRoutes';
test('game settings accept persisted ranges and reject out-of-range or unknown rules',()=>{
 const valid={maxPlayers:24,guessRateLimitPerMinute:60,chatRateLimitPerMinute:30,allowCustomWords:true};
 assert.equal(gameSettingsSchema.safeParse(valid).success,true);
 assert.equal(gameSettingsSchema.safeParse({...valid,maxPlayers:33}).success,false);
 assert.equal(gameSettingsSchema.safeParse({...valid,roundSeconds:90}).success,false);
});
