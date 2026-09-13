import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, BookOpen, AlignJustify, LayoutTemplate } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// READER — Architecture notes
//
// NAVIGATION (paged modes):
//   Tap zones: left 35% = prev, center 30% = toggle UI, right 35% = next
//   Swipe: secondary gesture (>50px horizontal, <400ms)
//   When zoomed: ANY tap = toggle UI (no accidental page turns)
//
// ZOOM / PAN:
//   CSS transform (translate + scale) on the image wrapper
//   Clamped pan: image never goes out of viewport
//   Zoom persists across page turns, pan resets to center
//
// ALWAYS VISIBLE:
//   - Thin 2px progress bar at bottom edge
//   - Page counter pill (hidden when main UI shows)
//
// AUTO-HIDE UI: 3.5 seconds after last interaction
//
// WEBTOON:
//   Native browser scroll (overflow-y: auto, touchAction: pan-y pinch-zoom)
//   Progressive page loading (one by one, placeholders until ready)
//   IntersectionObserver updates page counter as user scrolls
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'single' | 'double' | 'webtoon';

const UI_HIDE_DELAY = 3500;

export const Reader: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Comic metadata ──
  const [loading, setLoading]     = useState(true);
  const [title, setTitle]         = useState('');
  const [page, setPage]           = useState(0);
  const [totalPages, setTotal]    = useState(0);

  // ── UI state ──
  const [showUI, setShowUI]       = useState(true);
  const [mode, setMode]           = useState<Mode>('single');

  // ── Paged image state ──
  const [pageUrl, setPageUrl]     = useState<string | null>(null);
  const [pageUrl2, setPageUrl2]   = useState<string | null>(null); // double or preloaded next
  const [imgLoading, setImgLoading] = useState(false);

  // ── Zoom / Pan ──
  const [scale, setScale]         = useState(1);
  const [pan, setPan]             = useState({ x: 0, y: 0 });

  // ── Webtoon ──
  const [webtoonUrls, setWebtoonUrls] = useState<(string | null)[]>([]);

  // ── Stable refs ──
  const parserRef    = useRef<ComicParser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pageElsRef   = useRef<(HTMLDivElement | null)[]>([]);

  // Live-value bag: safe to read inside native event listeners without stale closures
  const L = useRef({ page: 0, total: 0, scale: 1, pan: { x: 0, y: 0 }, mode: 'single' as Mode, showUI: true });
  L.current = { page, total: totalPages, scale, pan, mode, showUI };

  // Stable navigation callbacks (always point to latest logic)
  const goFn   = useRef((_p: number) => {});
  const nextFn = useRef(() => {});
  const prevFn = useRef(() => {});

  // ══════════════════════════════════════════════════════
  // LOAD COMIC
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [local, file] = await Promise.all([
          storage.getComic(id),
          storage.getComicFile(id),
        ]);
        if (!local || !file) { navigate('/'); return; }
        const parser = new ComicParser(file, local.fileName);
        await parser.load();
        parserRef.current = parser;
        setTitle(local.title || local.fileName);
        setTotal(parser.getTotalPages());
        setPage(local.currentPage ?? 0);
        setLoading(false);
      } catch (e) { console.error(e); navigate('/'); }
    })();
  }, [id, navigate]);

  // ══════════════════════════════════════════════════════
  // NAVIGATION CALLBACKS
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    const go = (p: number) => {
      const c = Math.max(0, Math.min(p, L.current.total - 1));
      setPage(c);
      setPan({ x: 0, y: 0 }); // reset pan, keep zoom
      if (id && L.current.total > 0) storage.saveProgress(id, c, L.current.total);
    };
    const step = mode === 'double' ? 2 : 1;
    goFn.current   = go;
    nextFn.current = () => go(L.current.page + step);
    prevFn.current = () => go(L.current.page - step);
  }, [id, mode]);

  // ══════════════════════════════════════════════════════
  // LOAD PAGED IMAGE (single / double)
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (mode === 'webtoon' || !parserRef.current || loading || totalPages === 0) return;
    let alive = true;
    setImgLoading(true);
    setPageUrl(null);
    setPageUrl2(null);

    (async () => {
      try {
        // Load current page
        const url = await parserRef.current!.getPageUrl(page);
        if (!alive) return;
        setPageUrl(url);
        setImgLoading(false);

        // Preload: next page (single) or second page (double)
        const preloadIdx = mode === 'double' ? page + 1 : page + 1;
        if (preloadIdx < totalPages) {
          const url2 = await parserRef.current!.getPageUrl(preloadIdx);
          if (alive) setPageUrl2(url2);
        }
      } catch (e) { console.error(e); if (alive) setImgLoading(false); }
    })();

    return () => { alive = false; };
  }, [page, mode, loading, totalPages]);

  // ══════════════════════════════════════════════════════
  // WEBTOON — Progressive loading
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (mode !== 'webtoon' || !parserRef.current || loading || totalPages === 0) return;
    let alive = true;

    setWebtoonUrls(new Array(totalPages).fill(null));

    (async () => {
      for (let i = 0; i < totalPages; i++) {
        if (!alive) break;
        try {
          const url = await parserRef.current!.getPageUrl(i);
          if (!alive) break;
          setWebtoonUrls(prev => {
            const next = [...prev];
            next[i] = url;
            return next;
          });
        } catch (e) { console.error('webtoon page', i, e); }
      }
    })();

    return () => { alive = false; };
  }, [mode, loading, totalPages]);

  // ══════════════════════════════════════════════════════
  // WEBTOON — IntersectionObserver (page counter tracking)
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (mode !== 'webtoon' || !containerRef.current) return;
    const els = pageElsRef.current.filter(Boolean) as HTMLDivElement[];
    if (!els.length) return;

    const observer = new IntersectionObserver(
      entries => {
        // The most visible entry = current page
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) {
            best = e;
          }
        }
        if (best) {
          const idx = parseInt((best.target as HTMLElement).dataset.pi ?? '0', 10);
          setPage(idx);
          if (id) storage.saveProgress(id, idx, L.current.total);
        }
      },
      { threshold: [0.1, 0.5], root: containerRef.current }
    );

    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, webtoonUrls.length, id]);

  // ══════════════════════════════════════════════════════
  // UI AUTO-HIDE
  // ══════════════════════════════════════════════════════
  const flashUI = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setShowUI(false), UI_HIDE_DELAY);
  }, []);

  const toggleUI = useCallback(() => {
    if (L.current.showUI) {
      setShowUI(false);
      clearTimeout(uiTimerRef.current);
    } else {
      flashUI();
    }
  }, [flashUI]);

  // Desktop: show UI on mouse move
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    window.addEventListener('mousemove', flashUI);
    return () => { window.removeEventListener('mousemove', flashUI); clearTimeout(uiTimerRef.current); };
  }, [flashUI]);

  // ══════════════════════════════════════════════════════
  // KEYBOARD
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextFn.current(); }
      else if (e.key === 'ArrowLeft')              { e.preventDefault(); prevFn.current(); }
      else if (e.key === 'Escape')                 navigate(-1);
      else if (e.key === '+' || e.key === '=')     setScale(s => Math.min(4, +(s + 0.25).toFixed(2)));
      else if (e.key === '-')                       setScale(s => Math.max(1, +(s - 0.25).toFixed(2)));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [navigate]);

  // ══════════════════════════════════════════════════════
  // TOUCH ENGINE (native, mode-aware)
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading) return;

    // ── WEBTOON: browser handles scroll & pinch-zoom natively ──
    if (mode === 'webtoon') {
      const onClick = () => toggleUI();
      el.addEventListener('click', onClick);
      return () => el.removeEventListener('click', onClick);
    }

    // ── PAGED: full custom gesture engine ──
    const g = {
      phase: 'idle' as 'idle' | 'maybe-tap' | 'swipe' | 'pan' | 'pinch',
      x0: 0, y0: 0, t0: 0,
      lx: 0, ly: 0,
      wasZoomed: false,
      pd: 0, ps: 1, // pinch: startDist, startScale
    };

    const d2 = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;
      if (t.length === 1) {
        g.phase     = 'maybe-tap';
        g.wasZoomed = L.current.scale > 1;
        g.x0 = g.lx = t[0].clientX;
        g.y0 = g.ly = t[0].clientY;
        g.t0        = Date.now();
      } else if (t.length === 2) {
        g.phase = 'pinch';
        g.pd    = d2(t);
        g.ps    = L.current.scale;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;

      // ── Pinch-to-zoom ──
      if (g.phase === 'pinch' && t.length === 2) {
        const ns = Math.min(4, Math.max(1, g.ps * (d2(t) / g.pd)));
        setScale(ns);
        if (ns <= 1) setPan({ x: 0, y: 0 });
        return;
      }

      if (t.length !== 1) return;
      const dx = t[0].clientX - g.x0;
      const dy = t[0].clientY - g.y0;

      // Commit gesture type after 8px movement
      if (g.phase === 'maybe-tap' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        g.phase = g.wasZoomed ? 'pan' : 'swipe';
      }

      // ── Pan (when zoomed) ──
      if (g.phase === 'pan') {
        const s    = L.current.scale;
        const mdx  = t[0].clientX - g.lx;
        const mdy  = t[0].clientY - g.ly;
        g.lx = t[0].clientX;
        g.ly = t[0].clientY;
        const maxX = (el.clientWidth  * (s - 1)) / 2;
        const maxY = (el.clientHeight * (s - 1)) / 2;
        setPan(prev => ({
          x: Math.max(-maxX, Math.min(maxX, prev.x + mdx)),
          y: Math.max(-maxY, Math.min(maxY, prev.y + mdy)),
        }));
      }
    };

    const onEnd = (e: TouchEvent) => {
      const phase = g.phase;
      g.phase = 'idle';

      if (phase === 'pinch') return;

      // ── Tap ──
      if (phase === 'maybe-tap') {
        if (L.current.scale > 1) {
          // When zoomed: always just toggle UI (no accidental navigation)
          toggleUI();
        } else {
          // Tap zones: left 35% = prev, center 30% = toggle, right 35% = next
          const relX = g.x0 / el.clientWidth;
          if      (relX < 0.35) prevFn.current();
          else if (relX > 0.65) nextFn.current();
          else                  toggleUI();
        }
        return;
      }

      // ── Swipe (not zoomed, fast horizontal) ──
      if (phase === 'swipe' && e.changedTouches.length === 1 && L.current.scale <= 1) {
        const dx = e.changedTouches[0].clientX - g.x0;
        const dy = e.changedTouches[0].clientY - g.y0;
        const dt = Date.now() - g.t0;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 400) {
          if (dx < 0) nextFn.current();
          else        prevFn.current();
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [loading, mode, toggleUI]);

  // ══════════════════════════════════════════════════════
  // RENDER GUARDS
  // ══════════════════════════════════════════════════════
  if (loading || !id) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (totalPages === 0) return (
    <div className="fixed inset-0 bg-black text-gray-500 flex items-center justify-center">
      Nenhuma página encontrada.
    </div>
  );

  const isZoomed = scale > 1;
  const progressPct = totalPages > 1 ? (page / (totalPages - 1)) * 100 : 0;

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    // fixed inset-0: locks viewport, prevents any outer scroll bleed
    <div className="fixed inset-0 bg-black overflow-hidden select-none">

      {/* ════════════════════════════════════════════════
          IMAGE AREA (paged modes)
          ════════════════════════════════════════════════ */}
      {mode !== 'webtoon' && (
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ touchAction: 'none', overflow: 'hidden' }}
        >
          {/* CSS Transform wrapper — only mechanism for zoom/pan */}
          <div
            className="w-full h-full flex items-center justify-center gap-1"
            style={{
              transform:       `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition:      'transform 0.08s ease-out',
              willChange:      'transform',
            }}
          >
            {/* Loading spinner */}
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Current page */}
            {pageUrl && (
              <img
                src={pageUrl}
                alt={`Página ${page + 1}`}
                draggable={false}
                onLoad={() => setImgLoading(false)}
                style={{
                  maxWidth:        mode === 'double' ? '50%' : '100%',
                  maxHeight:       '100%',
                  width:           'auto',
                  height:          'auto',
                  objectFit:       'contain',
                  display:         'block',
                  userSelect:      'none',
                  WebkitUserSelect: 'none' as any,
                }}
              />
            )}

            {/* Double page: second page */}
            {mode === 'double' && pageUrl2 && (
              <img
                src={pageUrl2}
                alt={`Página ${page + 2}`}
                draggable={false}
                style={{
                  maxWidth:   '50%',
                  maxHeight:  '100%',
                  width:      'auto',
                  height:     'auto',
                  objectFit:  'contain',
                  display:    'block',
                  userSelect: 'none',
                }}
              />
            )}
          </div>

          {/* Desktop click zones (mouse devices only) */}
          {!isZoomed && (
            <div className="absolute inset-0 z-10 hidden md:flex pointer-events-auto">
              <div className="w-[35%] h-full cursor-pointer" onClick={() => prevFn.current()} />
              <div className="w-[30%] h-full cursor-pointer" onClick={toggleUI} />
              <div className="w-[35%] h-full cursor-pointer" onClick={() => nextFn.current()} />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          WEBTOON AREA (native scroll)
          ════════════════════════════════════════════════ */}
      {mode === 'webtoon' && (
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{
            touchAction:   'pan-y pinch-zoom', // native vertical scroll + pinch-to-zoom
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch' as any,
          }}
        >
          <div className="w-full flex flex-col">
            {webtoonUrls.map((url, i) => (
              <div
                key={i}
                ref={el => { pageElsRef.current[i] = el; }}
                data-pi={i}
                className="w-full"
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Página ${i + 1}`}
                    draggable={false}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                ) : (
                  /* Placeholder skeleton while page loads */
                  <div
                    className="w-full flex items-center justify-center bg-zinc-950"
                    style={{ minHeight: '56vw' }}
                  >
                    <div className="w-5 h-5 border-2 border-zinc-700 border-t-[#e50914] rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}

            {/* End-of-comic screen */}
            {webtoonUrls.length > 0 && webtoonUrls.every(u => u !== null) && (
              <div className="flex flex-col items-center gap-4 py-16 bg-black">
                <div className="w-12 h-12 rounded-full bg-[#e50914]/10 flex items-center justify-center">
                  <span className="text-[#e50914] text-xl">✓</span>
                </div>
                <p className="text-gray-400 text-sm font-medium">Fim do quadrinho</p>
                <button
                  onClick={() => navigate(-1)}
                  className="bg-[#e50914] text-white px-6 py-2.5 rounded-full text-sm font-semibold mt-1"
                >
                  Voltar à biblioteca
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          ALWAYS VISIBLE: thin progress bar (bottom edge)
          ════════════════════════════════════════════════ */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-[2px] bg-black/40">
        <div
          className="h-full bg-[#e50914] transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ════════════════════════════════════════════════
          ALWAYS VISIBLE: page counter pill (hides when full UI shows)
          ════════════════════════════════════════════════ */}
      <div
        className={`absolute z-40 left-1/2 -translate-x-1/2 transition-opacity duration-200 ${showUI ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ top: 'max(10px, env(safe-area-inset-top))' }}
      >
        <div className="bg-black/75 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full tabular-nums tracking-wide">
          {page + 1} <span className="text-gray-500">/</span> {totalPages}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          TOP BAR (auto-hide)
          ════════════════════════════════════════════════ */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-opacity duration-200 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between px-3 pb-6 bg-gradient-to-b from-black via-black/70 to-transparent gap-3">

          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white bg-black/60 backdrop-blur-sm px-3 py-2 rounded-full text-sm font-medium flex-shrink-0"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Voltar</span>
          </button>

          {/* Title */}
          <p className="flex-1 text-white/60 text-xs font-semibold text-center truncate min-w-0">
            {title}
          </p>

          {/* Mode selector */}
          <div className="flex bg-black/60 backdrop-blur-sm rounded-full p-0.5 flex-shrink-0">
            {([
              ['single',  LayoutTemplate, 'Página única'],
              ['double',  BookOpen,       'Duas páginas'],
              ['webtoon', AlignJustify,   'Vertical'],
            ] as const).map(([m, Icon, label]) => (
              <button
                key={m}
                title={label}
                onPointerDown={e => { e.stopPropagation(); setMode(m); setPan({ x: 0, y: 0 }); setScale(1); }}
                className={`rounded-full transition-colors flex items-center justify-center ${mode === m ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`}
                style={{ width: 36, height: 36 }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          BOTTOM BAR (auto-hide)
          ════════════════════════════════════════════════ */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 transition-opacity duration-200 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <div className="px-3 pt-8 bg-gradient-to-t from-black via-black/70 to-transparent">

          {/* Zoom controls (only when zoomed) */}
          {isZoomed && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <button
                onPointerDown={e => { e.stopPropagation(); setScale(s => Math.max(1, +(s - 0.25).toFixed(2))); }}
                className="bg-black/60 backdrop-blur-sm text-gray-300 rounded-full text-sm font-bold flex items-center justify-center"
                style={{ width: 40, height: 40 }}
              >
                −
              </button>
              <button
                onPointerDown={e => { e.stopPropagation(); setScale(1); setPan({ x: 0, y: 0 }); }}
                className="bg-black/60 backdrop-blur-sm text-[#e50914] text-xs font-bold px-4 py-2 rounded-full"
              >
                {Math.round(scale * 100)}% — resetar
              </button>
              <button
                onPointerDown={e => { e.stopPropagation(); setScale(s => Math.min(4, +(s + 0.25).toFixed(2))); }}
                className="bg-black/60 backdrop-blur-sm text-gray-300 rounded-full text-sm font-bold flex items-center justify-center"
                style={{ width: 40, height: 40 }}
              >
                +
              </button>
            </div>
          )}

          {/* Navigation row */}
          <div className="flex items-center gap-2 max-w-xl mx-auto">
            <button
              onPointerDown={e => { e.stopPropagation(); prevFn.current(); }}
              className="text-white bg-black/60 backdrop-blur-sm rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ width: 44, height: 44 }}
            >
              <ChevronLeft size={22} />
            </button>

            {/* Slider + labels */}
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, totalPages - 1)}
                value={page}
                onChange={e => goFn.current(parseInt(e.target.value))}
                className="w-full accent-[#e50914] cursor-pointer"
                style={{ height: 20 }}
              />
              <div className="flex justify-between items-center text-[10px] tabular-nums px-0.5">
                <span className="text-gray-600">1</span>
                <span className="text-gray-300 font-semibold">{page + 1} / {totalPages}</span>
                <span className="text-gray-600">{totalPages}</span>
              </div>
            </div>

            <button
              onPointerDown={e => { e.stopPropagation(); nextFn.current(); }}
              className="text-white bg-black/60 backdrop-blur-sm rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ width: 44, height: 44 }}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
