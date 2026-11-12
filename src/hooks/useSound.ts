import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'drawspace:sound';

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.06, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export type SoundName = 'correct' | 'round' | 'end' | 'tick' | 'join';

export function playSound(name: SoundName) {
  try {
    if (localStorage.getItem(KEY) === 'off') return;
  } catch {
    /* ignore */
  }
  switch (name) {
    case 'correct':
      tone(660, 0, 0.12);
      tone(880, 0.09, 0.16);
      break;
    case 'round':
      tone(440, 0, 0.1, 0.05);
      tone(587, 0.1, 0.14, 0.05);
      break;
    case 'end':
      tone(523, 0, 0.14);
      tone(659, 0.12, 0.14);
      tone(784, 0.24, 0.24);
      break;
    case 'tick':
      tone(1200, 0, 0.04, 0.03, 'square');
      break;
    case 'join':
      tone(520, 0, 0.08, 0.04);
      break;
  }
}

export function useSoundToggle(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(KEY, v ? 'off' : 'on');
      } catch {
        /* ignore */
      }
      return !v;
    });
  }, []);
  return [on, toggle];
}

export function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}