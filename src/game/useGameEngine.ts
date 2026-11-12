import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Room, RoomPlayer, Stroke, Word } from '@/types';
import { db, wordService } from '@/services';
import { playSound } from '@/hooks/useSound';
import type { DictKey } from '@/i18n/en';
import { botDrawingFor } from './botDrawings';

export type GamePhase = 'choosing' | 'drawing' | 'reveal' | 'finished';
export type GuessResult = 'correct' | 'close' | 'chat' | 'ignored';

export interface MatchResults {
  code: string;
  roomName: string;
  rounds: number;
  standings: (RoomPlayer & { place: number })[];
  words: Word[];
  myScore: number;
  myPlace: number;
  xpEarned: number;
  correctCount: number;
  turnsDrawn: number;
}

export interface EngineState {
  phase: GamePhase;
  turnIndex: number;
  round: number;
  totalRounds: number;
  timeLeft: number;
  timeTotal: number;
  choices: Word[];
  word: Word | null;
  drawerId: string;
  scores: Record<string, number>;
  guessedIds: string[];
  messages: ChatMessage[];
  replayStrokes: Stroke[];
  hintIndices: number[];
}

interface BotEvent { at: number; playerId: string; text: string; correct: boolean }

type T = (key: DictKey, vars?: Record<string, string | number>) => string;

const REVEAL_SECONDS = 4;
const BOT_CHOICE_SECONDS = 2.4;
const TICK_MS = 200;

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function useGameEngine(room: Room, myId: string, t: T, onFinish: (r: MatchResults) => void) {
  const players = room.players;
  const totalTurns = room.settings.rounds * players.length;
  const cfg = db.gameConfig;

  const poolRef = useRef<Word[]>([]);
  if (poolRef.current.length === 0) {
    const mode = room.settings.wordMode;
    if (mode === 'custom' && room.settings.customWords.length > 0) {
      poolRef.current = room.settings.customWords.map((text, i) => ({
        id: `custom-${i}`, text, difficulty: 'medium', category: 'Custom',
        definition: '', hint: '', active: true, translations: {},
      }));
    } else if (mode === 'easy' || mode === 'medium' || mode === 'hard') {
      poolRef.current = wordService.active(mode);
    } else {
      poolRef.current = wordService.active();
    }
    if (poolRef.current.length === 0) poolRef.current = wordService.active();
  }

  const stateRef = useRef<EngineState | null>(null);
  if (!stateRef.current) {
    const scores: Record<string, number> = {};
    players.forEach((p) => { scores[p.id] = 0; });
    stateRef.current = {
      phase: 'choosing', turnIndex: 0, round: 1, totalRounds: room.settings.rounds,
      timeLeft: 0, timeTotal: 1, choices: [], word: null,
      drawerId: players[0]?.id ?? myId, scores, guessedIds: [], messages: [],
      replayStrokes: [], hintIndices: [],
    };
  }

  const [, setVersion] = useState(0);
  const publish = () => setVersion((v) => v + 1);

  const usedWordsRef = useRef<string[]>([]);
  const usedWordsListRef = useRef<Word[]>([]);
  const eventsRef = useRef<BotEvent[]>([]);
  const drawingRef = useRef<Stroke[]>([]);
  const drawingPointsRef = useRef(0);
  const firstGuessRef = useRef(false);
  const msgIdRef = useRef(1);
  const lastTickRef = useRef(-1);
  const initializedRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const tRef = useRef(t);
  tRef.current = t;
  const statsRef = useRef({ correct: 0, first: 0, drawGuesses: 0, turnsDrawn: 0 });

  const pushMsg = (playerId: string, username: string, text: string, kind: ChatMessage['kind']) => {
    const st = stateRef.current!;
    st.messages = [...st.messages.slice(-140), { id: msgIdRef.current++, playerId, username, text, kind, at: Date.now() }];
  };

  const system = (text: string) => pushMsg('system', '', text, 'system');

  const pickWords = (count: number): Word[] => {
    const pool = poolRef.current.filter((w) => !usedWordsRef.current.includes(w.id));
    const source = pool.length >= count ? pool : poolRef.current;
    return [...source].sort(() => Math.random() - 0.5).slice(0, count);
  };

  const scheduleBots = (word: Word) => {
    const st = stateRef.current!;
    const events: BotEvent[] = [];
    const seconds = room.settings.roundSeconds;
    const bots = players.filter((p) => p.isBot && p.id !== st.drawerId);
    bots.forEach((bot) => {
      const willGuess = Math.random() < 0.85;
      const wrongCount = Math.floor(Math.random() * 3);
      for (let i = 0; i < wrongCount; i += 1) {
        const wrong = pickWords(1)[0];
        if (wrong && wrong.text !== word.text) {
          events.push({ at: seconds * (0.1 + Math.random() * 0.5), playerId: bot.id, text: wrong.text, correct: false });
        }
      }
      if (willGuess) {
        events.push({ at: seconds * (0.3 + Math.random() * 0.55), playerId: bot.id, text: word.text, correct: true });
      }
    });
    eventsRef.current = events.sort((a, b) => a.at - b.at);
  };

  const beginDrawing = (word: Word) => {
    const st = stateRef.current!;
    st.word = word;
    st.phase = 'drawing';
    st.timeLeft = room.settings.roundSeconds;
    st.timeTotal = room.settings.roundSeconds;
    st.guessedIds = [];
    st.hintIndices = [];
    st.choices = [];
    usedWordsRef.current.push(word.id);
    usedWordsListRef.current.push(word);
    firstGuessRef.current = false;
    lastTickRef.current = -1;
    const drawer = players.find((p) => p.id === st.drawerId);
    if (drawer?.isBot) {
      drawingRef.current = botDrawingFor(word.text);
      drawingPointsRef.current = drawingRef.current.reduce((n, s) => n + s.points.length, 0);
      st.replayStrokes = [];
    } else {
      drawingRef.current = [];
      drawingPointsRef.current = 0;
      st.replayStrokes = [];
    }
    scheduleBots(word);
    playSound('round');
    publish();
  };

  const startTurn = (index: number) => {
    const st = stateRef.current!;
    st.turnIndex = index;
    st.round = Math.floor(index / players.length) + 1;
    st.drawerId = players[index % players.length].id;
    st.word = null;
    st.guessedIds = [];
    st.hintIndices = [];
    st.replayStrokes = [];
    st.phase = 'choosing';
    const drawer = players.find((p) => p.id === st.drawerId)!;
    if (drawer.isBot) {
      st.choices = [];
      st.timeLeft = BOT_CHOICE_SECONDS;
      st.timeTotal = BOT_CHOICE_SECONDS;
    } else {
      st.choices = pickWords(cfg.wordChoiceCount);
      st.timeLeft = cfg.wordChoiceSeconds;
      st.timeTotal = cfg.wordChoiceSeconds;
      statsRef.current.turnsDrawn += 1;
    }
    system(tRef.current('game.drawer', { name: drawer.username }));
    publish();
  };

  const awardGuess = (playerId: string) => {
    const st = stateRef.current!;
    if (st.guessedIds.includes(playerId)) return;
    const frac = Math.max(0, st.timeLeft / st.timeTotal);
    let points = 50 + Math.round(70 * frac);
    if (!firstGuessRef.current) {
      points += 20;
      firstGuessRef.current = true;
      if (playerId === myId) statsRef.current.first += 1;
    }
    st.scores[playerId] = (st.scores[playerId] ?? 0) + points;
    st.scores[st.drawerId] = (st.scores[st.drawerId] ?? 0) + 25;
    st.guessedIds = [...st.guessedIds, playerId];
    if (playerId === myId) statsRef.current.correct += 1;
    if (st.drawerId === myId) statsRef.current.drawGuesses += 1;
    const guesser = players.find((p) => p.id === playerId);
    pushMsg(playerId, guesser?.username ?? '', tRef.current('game.guessed', { name: guesser?.username ?? '' }), 'correct');
    playSound('correct');
    const guessers = players.filter((p) => p.id !== st.drawerId);
    if (guessers.every((p) => st.guessedIds.includes(p.id))) {
      st.timeLeft = Math.min(st.timeLeft, 1.2);
    }
  };

  const endTurn = () => {
    const st = stateRef.current!;
    st.phase = 'reveal';
    st.timeLeft = REVEAL_SECONDS;
    st.timeTotal = REVEAL_SECONDS;
    if (st.word) system(tRef.current('game.wordWas', { word: st.word.text }));
    publish();
  };

  const finishMatch = () => {
    const st = stateRef.current!;
    if (finishedRef.current) return;
    finishedRef.current = true;
    st.phase = 'finished';
    const sorted = [...players].sort((a, b) => (st.scores[b.id] ?? 0) - (st.scores[a.id] ?? 0));
    const standings = sorted.map((p, i) => ({ ...p, score: st.scores[p.id] ?? 0, place: i + 1 }));
    const myPlace = standings.findIndex((p) => p.id === myId) + 1;
    const xp = db.xpConfig;
    const s = statsRef.current;
    const xpEarned = s.correct * xp.correctGuess + s.first * xp.firstGuessBonus
      + s.drawGuesses * xp.drawingPerGuess + (myPlace === 1 ? xp.winBonus : 0);
    playSound('end');
    publish();
    onFinishRef.current({
      code: room.code, roomName: room.name, rounds: room.settings.rounds,
      standings, words: usedWordsListRef.current,
      myScore: st.scores[myId] ?? 0, myPlace, xpEarned,
      correctCount: s.correct, turnsDrawn: s.turnsDrawn,
    });
  };

  const tick = () => {
    const st = stateRef.current!;
    if (st.phase === 'finished') return;
    const dt = TICK_MS / 1000;
    st.timeLeft = Math.max(0, st.timeLeft - dt);

    if (st.phase === 'choosing') {
      if (st.timeLeft <= 0) {
        const drawer = players.find((p) => p.id === st.drawerId)!;
        const word = drawer.isBot ? pickWords(1)[0] : st.choices[0];
        if (word) beginDrawing(word);
      }
      publish();
      return;
    }

    if (st.phase === 'drawing') {
      const elapsed = st.timeTotal - st.timeLeft;
      const due = eventsRef.current.filter((e) => e.at <= elapsed);
      if (due.length > 0) {
        eventsRef.current = eventsRef.current.filter((e) => e.at > elapsed);
        due.forEach((e) => {
          if (e.correct) awardGuess(e.playerId);
          else {
            const bot = players.find((p) => p.id === e.playerId);
            pushMsg(e.playerId, bot?.username ?? '', e.text, 'guess');
          }
        });
      }
      const drawer = players.find((p) => p.id === st.drawerId);
      if (drawer?.isBot && drawingPointsRef.current > 0) {
        const progress = Math.min(1, elapsed / (st.timeTotal * 0.72));
        let budget = Math.floor(drawingPointsRef.current * progress);
        const revealed: Stroke[] = [];
        for (const stroke of drawingRef.current) {
          if (budget <= 0) break;
          const take = Math.min(stroke.points.length, budget);
          revealed.push({ ...stroke, points: stroke.points.slice(0, take) });
          budget -= take;
        }
        st.replayStrokes = revealed;
      }
      if (db.gameConfig.hintReveal && st.word && st.drawerId !== myId) {
        const letters = st.word.text.replace(/\s/g, '').length;
        const want = elapsed > st.timeTotal * 0.7 ? 2 : elapsed > st.timeTotal * 0.45 ? 1 : 0;
        while (st.hintIndices.length < want && st.hintIndices.length < letters - 1) {
          const idx = Math.floor(Math.random() * st.word.text.length);
          if (st.word.text[idx] !== ' ' && !st.hintIndices.includes(idx)) {
            st.hintIndices = [...st.hintIndices, idx];
          }
        }
      }
      const sec = Math.ceil(st.timeLeft);
      if (sec <= 5 && sec >= 1 && sec !== lastTickRef.current) {
        lastTickRef.current = sec;
        playSound('tick');
      }
      if (st.timeLeft <= 0) endTurn();
      publish();
      return;
    }

    if (st.phase === 'reveal') {
      if (st.timeLeft <= 0) {
        const next = st.turnIndex + 1;
        if (next >= totalTurns) finishMatch();
        else startTurn(next);
      }
      publish();
    }
  };

  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      startTurn(0);
    }
    const id = window.setInterval(() => tickRef.current(), TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseWord = (word: Word) => {
    const st = stateRef.current!;
    if (st.phase !== 'choosing' || st.drawerId !== myId) return;
    beginDrawing(word);
  };

  const rerollChoices = () => {
    const st = stateRef.current!;
    if (st.phase !== 'choosing' || st.drawerId !== myId) return;
    st.choices = pickWords(cfg.wordChoiceCount);
    publish();
  };

  const submitGuess = (text: string): GuessResult => {
    const st = stateRef.current!;
    const clean = normalize(text);
    if (!clean) return 'ignored';
    const me = players.find((p) => p.id === myId);
    if (st.phase !== 'drawing' || st.drawerId === myId || st.guessedIds.includes(myId) || !st.word) {
      pushMsg(myId, me?.username ?? '', text.trim(), 'chat');
      publish();
      return 'chat';
    }
    const answer = normalize(st.word.text);
    if (clean === answer) {
      awardGuess(myId);
      publish();
      return 'correct';
    }
    pushMsg(myId, me?.username ?? '', text.trim(), 'guess');
    publish();
    if (answer.length >= 4 && editDistance(clean, answer) <= 1) return 'close';
    return 'chat';
  };

  const st = stateRef.current;
  return {
    state: st,
    isMyTurn: st.drawerId === myId,
    myGuessed: st.guessedIds.includes(myId),
    chooseWord,
    rerollChoices,
    submitGuess,
  };
}
