import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Eraser, Pen, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { Stroke } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { IconButton } from '@/components/ui';

const W = 960;
const H = 600;
const BG = '#ffffff';
const COLORS = [
  { value: '#1b1b1f', name: 'Black' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#71717a', name: 'Gray' },
  { value: '#d4d4d8', name: 'Light gray' },
];

interface Props {
  interactive: boolean;
  replayStrokes: Stroke[];
}

export function DrawingCanvas({ interactive, replayStrokes }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(6);
  const pastRef = useRef<Stroke[][]>([]);
  const futureRef = useRef<Stroke[][]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const paintStroke = useCallback((c: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return;
    c.strokeStyle = stroke.tool === 'eraser' ? BG : stroke.color;
    c.lineWidth = stroke.tool === 'eraser' ? stroke.size * 2.6 : stroke.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const [first, ...rest] = stroke.points;
    c.moveTo(first.x * W, first.y * H);
    if (rest.length === 0) c.lineTo(first.x * W + 0.01, first.y * H + 0.01);
    rest.forEach((p) => c.lineTo(p.x * W, p.y * H));
    c.stroke();
  }, []);

  const redraw = useCallback(() => {
    const c = ctx();
    const canvas = canvasRef.current;
    if (!c || !canvas) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BG;
    c.fillRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const source = interactive ? strokes : replayStrokes;
    source.forEach((s) => paintStroke(c, s));
    if (liveRef.current) paintStroke(c, liveRef.current);
  }, [strokes, replayStrokes, interactive, paintStroke]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    redraw();
  }, [redraw]);

  const toPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const syncHistoryFlags = () => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || pointerRef.current !== null) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    pointerRef.current = e.pointerId;
    drawingRef.current = true;
    liveRef.current = { color, size, tool, points: [toPoint(e)] };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !drawingRef.current || !liveRef.current || e.pointerId !== pointerRef.current) return;
    const p = toPoint(e);
    const live = liveRef.current;
    const last = live.points[live.points.length - 1];
    live.points.push(p);
    const c = ctx();
    if (c) paintStroke(c, { ...live, points: [last, p] });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawingRef.current || !liveRef.current || e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    drawingRef.current = false;
    const done = liveRef.current;
    liveRef.current = null;
    pastRef.current.push(strokes);
    futureRef.current = [];
    setStrokes((prev) => [...prev, done]);
    syncHistoryFlags();
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.unshift(strokes);
    setStrokes(prev);
    syncHistoryFlags();
  };

  const redo = () => {
    const next = futureRef.current.shift();
    if (!next) return;
    pastRef.current.push(strokes);
    setStrokes(next);
    syncHistoryFlags();
  };

  const clear = () => {
    if (strokes.length === 0) return;
    pastRef.current.push(strokes);
    futureRef.current = [];
    setStrokes([]);
    syncHistoryFlags();
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas-stage">
        <canvas
          ref={canvasRef}
          className={`drawing-canvas ${interactive ? 'interactive' : ''}`}
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => { if (interactive) e.preventDefault(); }}
          aria-label={interactive ? t('game.youAreDrawing') : t('game.canvas')}
          role="img"
        />
      </div>
      {interactive && (
        <div className="canvas-toolbar" role="toolbar" aria-label={t('game.pen')}>
          <div className="tool-group tools">
            <IconButton label={t('game.pen')} className={tool === 'pen' ? 'tool-active' : ''} onClick={() => setTool('pen')} aria-pressed={tool === 'pen'}>
              <Pen size={16} />
            </IconButton>
            <IconButton label={t('game.eraser')} className={tool === 'eraser' ? 'tool-active' : ''} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'}>
              <Eraser size={16} />
            </IconButton>
          </div>
          <div className="tool-group swatches" role="group" aria-label={t('game.pen')}>
            {COLORS.map((c) => (
              <button
                key={c.value}
                className={`swatch ${color === c.value && tool === 'pen' ? 'active' : ''}`}
                style={{ '--swatch': c.value } as CSSProperties}
                aria-label={c.name}
                aria-pressed={color === c.value && tool === 'pen'}
                onClick={() => { setColor(c.value); setTool('pen'); }}
              >
                <span className="swatch-dot" aria-hidden />
              </button>
            ))}
          </div>
          <div className="tool-group size-group">
            <label className="size-label faint" htmlFor="brush-size">{t('game.brushSize')}</label>
            <input
              id="brush-size" type="range" min={2} max={26} step={1} value={size}
              onChange={(e) => setSize(Number(e.target.value))} className="range size-range"
              aria-valuetext={`${size}px`}
            />
            <span className="size-preview" aria-hidden>
              <span style={{ width: Math.min(22, size + 4), height: Math.min(22, size + 4), background: tool === 'eraser' ? '#d4d4d8' : color }} />
            </span>
          </div>
          <div className="tool-group history">
            <IconButton label={t('game.undo')} onClick={undo} disabled={!canUndo}><Undo2 size={16} /></IconButton>
            <IconButton label={t('game.redo')} onClick={redo} disabled={!canRedo}><Redo2 size={16} /></IconButton>
            <IconButton label={t('game.clear')} onClick={clear} disabled={strokes.length === 0}><Trash2 size={16} /></IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
