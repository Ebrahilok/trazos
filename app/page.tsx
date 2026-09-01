'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eraser, FilePlus2, PenLine, Printer, RotateCcw, Save, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

type Point = { x: number; y: number };
type Stroke = Point[];
type Variant = Stroke[];
type GlyphLibrary = Record<string, Variant[]>;

const oval = (cx: number, cy: number, rx: number, ry: number, lean = 0): Stroke =>
  Array.from({ length: 29 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 28;
    const y = cy + Math.sin(angle) * ry;
    return { x: cx + Math.cos(angle) * rx + ((y - cy) / ry) * lean, y };
  });

const STARTER_GLYPHS: GlyphLibrary = {
  a: Array.from({ length: 10 }, (_, index) => [
    oval(40 + (index % 3), 64 + ((index * 2) % 4), 24 + (index % 4), 22 + ((index * 3) % 4), -3 + (index % 7)),
    [{ x: 57 + (index % 4), y: 48 + (index % 5) }, { x: 61 + (index % 3), y: 89 + (index % 5) }],
  ]),
  o: Array.from({ length: 10 }, (_, index) => [
    oval(47 + (index % 4), 64 + ((index * 3) % 4), 25 + (index % 5), 23 + ((index * 2) % 4), -3 + (index % 7)),
  ]),
};

const STARTER_TEXT = 'Cada palabra guarda un ritmo propio.\nDibuja varias versiones de una letra y Trazo las alternará por ti.';

function pathFromStroke(stroke: Stroke) {
  return stroke.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function GlyphPreview({ variant, color = '#183d38', className = '', style }: { variant: Variant; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 120" className={className} style={style} role="img" aria-label="Variante dibujada">
      {variant.map((stroke, index) => (
        <path key={index} d={pathFromStroke(stroke)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function HandwrittenText({ text, glyphs, color, size, humanize }: { text: string; glyphs: GlyphLibrary; color: string; size: number; humanize: number }) {
  const rendered = useMemo(() => {
    const counters: Record<string, number> = {};
    return text.split('\n').map((line, lineIndex) => (
      <div key={lineIndex} className="hand-line">
        {Array.from(line).map((character, index) => {
          const seed = lineIndex * 997 + index * 37 + character.charCodeAt(0);
          const amount = humanize / 100;
          if (character === ' ') return <span key={index} className="word-space" style={{ width: `${0.38 + seededUnit(seed) * 0.26 * amount}em` }} />;
          const key = character.toLowerCase();
          const variants = glyphs[key];
          const letterStyle: CSSProperties = {
            marginInlineEnd: `${(seededUnit(seed + 1) - 0.5) * 0.16 * amount}em`,
            transform: `translateY(${(seededUnit(seed + 2) - 0.5) * 0.18 * amount}em) rotate(${(seededUnit(seed + 3) - 0.5) * 5 * amount}deg) scale(${1 + (seededUnit(seed + 4) - 0.5) * 0.06 * amount})`,
          };
          if (!variants?.length) return <span key={index} className="fallback-letter humanized-letter" style={letterStyle}>{character}</span>;
          const count = counters[key] ?? 0;
          counters[key] = count + 1;
          const variantIndex = Math.floor(seededUnit(seed + count * 17) * variants.length);
          return <GlyphPreview key={index} variant={variants[variantIndex]} color={color} className="inline-glyph humanized-letter" style={letterStyle} />;
        })}
      </div>
    ));
  }, [text, glyphs, color, humanize]);
  return <div className="handwriting" style={{ color, fontSize: `${size}px` }}>{rendered}</div>;
}

function DrawPad({ strokes, onChange, color }: { strokes: Variant; onChange: (strokes: Variant) => void; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#fffdf7';
    context.fillRect(0, 0, width, height);
    context.setLineDash([6, 7]);
    context.lineWidth = 1.5;
    context.strokeStyle = '#d8cdbb';
    [28, 78, 104].forEach((guide) => {
      context.beginPath(); context.moveTo(0, (guide / 120) * height); context.lineTo(width, (guide / 120) * height); context.stroke();
    });
    context.setLineDash([]);
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath();
      stroke.forEach((point, index) => {
        const x = (point.x / 100) * width; const y = (point.y / 120) * height;
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.stroke();
    });
  }, [strokes, color]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(120, ((event.clientY - rect.top) / rect.height) * 120)),
    };
  };

  return (
    <canvas ref={canvasRef} width={700} height={420} className="draw-pad" aria-label="Lienzo para dibujar una letra"
      onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); onChange([...strokes, [pointFromEvent(event)]]); }}
      onPointerMove={(event) => { if (!drawing.current) return; const next = strokes.map((stroke) => [...stroke]); next[next.length - 1]?.push(pointFromEvent(event)); onChange(next); }}
      onPointerUp={(event) => { drawing.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drawing.current = false; }} />
  );
}

export default function Home() {
  const [text, setText] = useState(STARTER_TEXT);
  const [glyphs, setGlyphs] = useState<GlyphLibrary>(STARTER_GLYPHS);
  const [selectedCharacter, setSelectedCharacter] = useState('a');
  const [draft, setDraft] = useState<Variant>([]);
  const [ink, setInk] = useState('#183d38');
  const [fontSize, setFontSize] = useState(35);
  const [humanize, setHumanize] = useState(62);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem('trazo-project');
    if (!stored) return;
    try {
      const project = JSON.parse(stored) as { text?: string; glyphs?: GlyphLibrary; ink?: string; fontSize?: number; humanize?: number };
      if (project.text) setText(project.text);
      if (project.glyphs) setGlyphs(project.glyphs);
      if (project.ink) setInk(project.ink);
      if (project.fontSize) setFontSize(project.fontSize);
      if (typeof project.humanize === 'number') setHumanize(project.humanize);
    } catch { /* Keep starter data if local data is invalid. */ }
  }, []);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem('trazo-project', JSON.stringify({ text, glyphs, ink, fontSize, humanize }));
      setSaved(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [text, glyphs, ink, fontSize, humanize]);

  const currentVariants = glyphs[selectedCharacter] ?? [];
  const saveVariant = () => {
    if (!draft.some((stroke) => stroke.length > 1)) return;
    setGlyphs((library) => ({ ...library, [selectedCharacter]: [...(library[selectedCharacter] ?? []), draft] }));
    setDraft([]);
  };
  const exportProject = () => {
    const blob = new Blob([JSON.stringify({ text, glyphs, ink, fontSize, humanize }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'mi-fuente-trazo.json'; link.click(); URL.revokeObjectURL(link.href);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Trazo"><span className="brand-mark"><PenLine /></span><div><strong>Trazo</strong><span>escritura con pulso</span></div></div>
        <div className="document-title"><Input aria-label="Nombre del documento" defaultValue="Mi primer cuaderno" /><span className={saved ? 'saved' : ''}>{saved ? 'Guardado' : 'Guardando…'}</span></div>
        <div className="top-actions">
          <Button variant="ghost" size="lg" onClick={() => setText('')}><FilePlus2 /> Nuevo</Button>
          <Button variant="outline" size="lg" onClick={exportProject}><Download /> Fuente</Button>
          <Button size="lg" onClick={() => window.print()}><Printer /> Imprimir</Button>
        </div>
      </header>

      <section className="workspace">
        <div className="editor-column">
          <div className="formatbar" aria-label="Herramientas de documento">
            <div className="tool-group"><span className="tool-label">Tamaño</span><Slider aria-label="Tamaño de letra" min={24} max={56} value={[fontSize]} onValueChange={(value) => setFontSize(value[0])} /><output>{fontSize}</output></div>
            <div className="tool-group"><span className="tool-label">Pulso</span><Slider aria-label="Humanización" min={0} max={100} value={[humanize]} onValueChange={(value) => setHumanize(value[0])} /><output>{humanize}%</output></div>
            <div className="tool-group compact"><label htmlFor="ink">Tinta</label><input id="ink" type="color" value={ink} onChange={(event) => setInk(event.target.value)} /></div>
            <div className="variation-status"><Sparkles /> {Object.values(glyphs).reduce((sum, variants) => sum + variants.length, 0)} variantes activas</div>
          </div>

          <div className="document-stage">
            <article className="paper">
              <div className="paper-meta"><span>Documento</span><span>01</span></div>
              <textarea className="source-text" aria-label="Texto del documento" value={text} onChange={(event) => setText(event.target.value)} placeholder="Escribe aquí…" />
              <div className="preview-label"><span>Vista con tu letra</span><span>las variantes cambian solas</span></div>
              <HandwrittenText text={text} glyphs={glyphs} color={ink} size={fontSize} humanize={humanize} />
            </article>
          </div>
        </div>

        <aside className="letter-studio">
          <div className="studio-heading"><div><span className="eyebrow">Taller de letra</span><h1>Dibuja otra versión</h1></div><span className="step">1 carácter</span></div>
          <div className="character-row"><label htmlFor="character">Letra</label><Input id="character" value={selectedCharacter} maxLength={1} onChange={(event) => { const character = Array.from(event.target.value.toLowerCase()).at(-1) ?? ''; if (character) setSelectedCharacter(character); }} /><div><strong>{currentVariants.length}</strong><span>de 10 mínimas</span></div></div>
          <div className="variant-progress" aria-label={`${currentVariants.length} de 10 variantes`}><span style={{ width: `${Math.min(100, currentVariants.length * 10)}%` }} /><small>{currentVariants.length >= 10 ? 'Lista para alternar con naturalidad' : `Faltan ${10 - currentVariants.length} muestras`}</small></div>
          <div className="canvas-wrap"><div className="canvas-note"><PenLine /> Usa lápiz o dedo</div><DrawPad strokes={draft} onChange={setDraft} color={ink} /></div>
          <div className="canvas-actions">
            <Button variant="ghost" size="lg" aria-label="Deshacer último trazo" onClick={() => setDraft((strokes) => strokes.slice(0, -1))} disabled={!draft.length}><Undo2 /> Deshacer</Button>
            <Button variant="ghost" size="lg" onClick={() => setDraft([])} disabled={!draft.length}><Eraser /> Limpiar</Button>
            <Button size="lg" onClick={saveVariant} disabled={!draft.length}><Save /> Guardar variante</Button>
          </div>
          <div className="variants-section">
            <div className="variants-title"><h2>Variantes de “{selectedCharacter}”</h2><span>Se mezclan automáticamente</span></div>
            {currentVariants.length ? <div className="variant-grid">{currentVariants.map((variant, index) => (
              <div className="variant-card" key={index}><span>#{index + 1}</span><GlyphPreview variant={variant} color={ink} /><button aria-label={`Eliminar variante ${index + 1}`} onClick={() => setGlyphs((library) => ({ ...library, [selectedCharacter]: library[selectedCharacter].filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 /></button></div>
            ))}</div> : <div className="empty-variants"><RotateCcw /><p>Dibuja la primera versión de esta letra.</p></div>}
          </div>
        </aside>
      </section>
    </main>
  );
}
