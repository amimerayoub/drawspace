# Multiplayer Canvas Reset Fix

## Status: FIXED and verified by regression test

The multiplayer drawing canvas no longer carries strokes between rounds, no longer
diverges between clients, and re-syncs correctly on reconnect. The fix is
server-authoritative and covered by an integration test that drives two real Socket.IO
clients through a full multi-round match.

## Symptom

During a match, the drawing canvas could show the previous round's drawing after a new
round started, differ between the drawer and guessers, or reappear after a client
reconnected. Strokes sent late from an old round could leak into the new round.

## Root cause

Drawing state was treated as client-owned and round transitions did not reliably clear a
single authoritative buffer:

- There was no per-turn identity, so a delayed `game:stroke` from a previous round could
  not be distinguished from a current-round stroke.
- The stroke buffer was not guaranteed to be cleared at every round boundary, so old
  strokes survived into the next round and into reconnect re-sync.
- Clients could diverge because each kept its own canvas state instead of trusting the
  server's current-round snapshot.

## Fix (server-authoritative)

All drawing state lives in the game engine's room buffer and is gated by a monotonic
`turnId`.

- `server/src/game/engine.ts`
  - `turnId` increments on every word choice / round start (`chooseWordLocal`).
  - The stroke, undo, and redo buffers are cleared on round start, round end, and match
    reset (`chooseWordLocal`, `endRoundLocal`, reset paths).
  - `addStrokeLocal` rejects any stroke whose `turnId` does not match the current room
    `turnId` with `STALE_TURN`, and enforces a 2500-stroke cap.
  - Only the current drawer may add/undo/redo/clear (`assertDrawer`).
- `server/src/socket/handlers.ts`
  - `game:stroke` requires a `turnId` and broadcasts the accepted stroke with the
    server's current `turnId`.
  - `game:clear` is idempotent and broadcasts an empty `game:drawing-state`.
  - On join/reconnect the server emits `game:round-start` and a `game:drawing-state`
    snapshot of the current round only, so a reconnecting client never receives
    previous-round strokes.

Because the server is the single source of truth and every client renders the
server-provided current-round state, all clients stay consistent across rounds and
reconnects.

## Regression test

`server/src/socket/canvasReset.integration.test.ts` starts the real app and Socket.IO
server with an isolated in-memory TablesDB double and two authenticated clients, then
asserts:

1. Both clients receive the same stroke in round 1.
2. A correct guess ends the round.
3. Both clients' `room:update` at `round_end` carries an empty stroke buffer, and the
   server buffer is empty.
4. The next round's `choosing` update is empty.
5. Both clients' `drawing` update for round 2 is empty.
6. A new stroke in round 2 reaches both clients.
7. A delayed round-1 stroke is rejected with `STALE_TURN` and does not enter the buffer.
8. Duplicate `game:clear` events are safe and idempotent.
9. A reconnecting client receives the current round's state (round 2 drawer and exactly
   the current stroke), not previous-round strokes.

`server/src/game/engine.test.ts` additionally asserts round transitions clear the buffer
and stale-turn strokes are rejected at the engine level.

## Test result

```
npx tsx --test server/src/socket/canvasReset.integration.test.ts server/src/game/engine.test.ts
# tests 7
# pass 7
# fail 0
# skipped 0
```

The full server suite (122 tests) passes with 0 failures. The canvas issue is marked
fixed because the regression test passes.