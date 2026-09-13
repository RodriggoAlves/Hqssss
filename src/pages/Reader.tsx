import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Layout, BookOpen, AlignJustify } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// WHY NATIVE EVENTS + REFS?
//
// React's synthetic touch events (onTouchMove) are PASSIVE by default in
// modern browsers — they can't call e.preventDefault(). Without that, the
// browser keeps its own scroll/zoom behavior and fights our gesture code.
//
// Using refs for all touch state means we never get stale closures even when
// the event listeners are set up just once (on mount). Every read inside the
// listener goes through a ref and gets the live value.
// ─────────────────────────────────────────────────────────────────────────────

export const Reader: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [displayMode, setDisplayMode] = useState<'single' | 'double' | 'webtoon'>('single');
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(false);
  // Visual zoom/pan — displayed via CSS transform
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const parserRef = useRef<ComicParser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── LIVE REFS (always current, safe to read inside native event listeners) ──
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pageRef = useRef(0);
  const totalPagesRef = useRef(0);
  const displayModeRef = useRef<'single' | 'double' | 'webtoon'>('single');
  const showUIRef = useRef(true);
  // Keep refs in sync every render
  scaleRef.current = scale;
  panRef.current = pan;
  pageRef.current = page;
  totalPagesRef.current = totalPages;
  displayModeRef.current = displayMode;
  showUIRef.current = showUI;

  // Stable callback refs for next/prev/go
  const goFn = useRef<(p: number) => void>(() => {});
  const nextFn = useRef<() => void>(() => {});
  const prevFn = useRef<() => void>(() => {});

  // ── LOAD COMIC ──
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const local = await storage.getComic(id);
        const file = await storage.getComicFile(id);
        if (!local || !file) { navigate('/'); return; }
        const parser = new ComicParser(file, local.fileName);
        await parser.load();
        parserRef.current = parser;
        setTotalPages(parser.getTotalPages());
        setPage(local.currentPage ?? 0);
        setLoading(false);
      } catch (e) { console.error(e); navigate('/'); }
    })();
  }, [id, navigate]);

  // ── LOAD PAGES ──
  useEffect(() => {
    if (!parserRef.current || loading || totalPages === 0) return;
    let mounted = true;
    setImgLoading(true);
    (async () => {
      try {
        const urls: string[] = [];
        if (displayMode === 'double') {
          urls.push(await parserRef.current!.getPageUrl(page));
          if (page + 1 < totalPages) urls.push(await parserRef.current!.getPageUrl(page + 1));
        } else if (displayMode === 'webtoon') {
          for (let i = Math.max(0, page - 1); i <= Math.min(totalPages - 1, page + 3); i++) {
            urls.push(await parserRef.current!.getPageUrl(i));
          }
        } else {
          urls.push(await parserRef.current!.getPageUrl(page));
        }
        if (mounted) { setPageUrls(urls); setImgLoading(false); }
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, [page, displayMode, loading, totalPages]);

  // ── ZOOM / PAN HELPERS ──
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);


  // ── GO / NEXT / PREV ──
  useEffect(() => {
    const go = (p: number) => {
      const tp = totalPagesRef.current;
      const c = Math.max(0, Math.min(p, tp - 1));
      setPage(c);
      setScale(1); setPan({ x: 0, y: 0 }); // reset zoom on page change
      if (id && tp > 0) storage.saveProgress(id, c, tp);
    };
    const step = displayMode === 'double' ? 2 : 1;
    goFn.current  = go;
    nextFn.current = () => go(pageRef.current + step);
    prevFn.current = () => go(pageRef.current - step);
  }, [id, displayMode]);

  // ── KEYBOARD ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextFn.current(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevFn.current(); }
      else if (e.key === 'Escape') navigate(-1);
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(4, s + 0.25));
      else if (e.key === '-') setScale(s => Math.max(1, s - 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // ── DESKTOP: show UI on mouse move ──
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const show = () => {
      setShowUI(true);
      clearTimeout(uiTimerRef.current);
      uiTimerRef.current = setTimeout(() => setShowUI(false), 3000);
    };
    window.addEventListener('mousemove', show);
    return () => { window.removeEventListener('mousemove', show); clearTimeout(uiTimerRef.current); };
  }, []);

  // ── TOUCH GESTURE ENGINE (native, non-passive) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading) return;

    // Per-gesture mutable state (local to this effect, not React state)
    const g = {
      phase: 'idle' as 'idle' | 'maybe-tap' | 'swipe' | 'pan' | 'pinch',
      startX: 0, startY: 0, startTime: 0,
      lastX: 0, lastY: 0,
      panStartX: 0, panStartY: 0,
      pinchStartDist: 0, pinchStartScale: 1,
    };

    const fingerDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      // Webtoon: let browser handle vertical scroll naturally
      if (displayModeRef.current === 'webtoon') return;
      e.preventDefault();

      const t = e.touches;
      if (t.length === 1) {
        g.phase      = scaleRef.current > 1 ? 'pan' : 'maybe-tap';
        g.startX     = g.lastX = t[0].clientX;
        g.startY     = g.lastY = t[0].clientY;
        g.startTime  = Date.now();
        g.panStartX  = panRef.current.x;
        g.panStartY  = panRef.current.y;
      } else if (t.length === 2) {
        g.phase            = 'pinch';
        g.pinchStartDist   = fingerDist(t);
        g.pinchStartScale  = scaleRef.current;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (displayModeRef.current === 'webtoon') return;
      e.preventDefault();

      const t = e.touches;

      // ── PINCH ──
      if (g.phase === 'pinch' && t.length === 2) {
        const newScale = Math.min(4, Math.max(1,
          g.pinchStartScale * (fingerDist(t) / g.pinchStartDist)
        ));
        setScale(newScale);
        if (newScale <= 1) setPan({ x: 0, y: 0 });
        return;
      }

      if (t.length !== 1) return;

      const dx = t[0].clientX - g.startX;
      const dy = t[0].clientY - g.startY;

      // Determine gesture type from motion
      if (g.phase === 'maybe-tap') {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          g.phase = 'swipe';
        }
      }

      // ── PAN (when zoomed in) ──
      if (g.phase === 'pan') {
        const moveDx = t[0].clientX - g.lastX;
        const moveDy = t[0].clientY - g.lastY;
        g.lastX = t[0].clientX;
        g.lastY = t[0].clientY;

        const s = scaleRef.current;
        setPan(prev => {
          const cEl = el;
          const maxX = (cEl.clientWidth  * (s - 1)) / 2;
          const maxY = (cEl.clientHeight * (s - 1)) / 2;
          return {
            x: Math.max(-maxX, Math.min(maxX, prev.x + moveDx)),
            y: Math.max(-maxY, Math.min(maxY, prev.y + moveDy)),
          };
        });
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (displayModeRef.current === 'webtoon') return;

      const phase = g.phase;
      g.phase = 'idle';

      if (phase === 'pinch') return; // no further action after pinch

      if (phase === 'maybe-tap') {
        // Toggle UI
        setShowUI(v => !v);
        clearTimeout(uiTimerRef.current);
        return;
      }

      if (phase === 'swipe' && e.changedTouches.length === 1 && scaleRef.current <= 1) {
        const dx = e.changedTouches[0].clientX - g.startX;
        const dy = e.changedTouches[0].clientY - g.startY;
        const dt = Date.now() - g.startTime;
        // Horizontal swipe: fast, mostly horizontal
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 500) {
          if (dx < 0) nextFn.current();
          else prevFn.current();
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });

    // Webtoon: tap to toggle UI via click (native scroll handles everything else)
    const onWebtoonClick = () => {
      if (displayModeRef.current === 'webtoon') {
        setShowUI(v => !v);
        clearTimeout(uiTimerRef.current);
      }
    };
    el.addEventListener('click', onWebtoonClick);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('click', onWebtoonClick);
    };
  }, [loading]); // attach once after load; all state access is via refs

  // ── RENDER GUARDS ──
  if (loading || !id) return (
    <div className="h-screen bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (totalPages === 0) return (
    <div className="h-screen bg-black text-gray-400 flex items-center justify-center">
      Nenhuma página encontrada.
    </div>
  );

  const isZoomed = scale > 1;

  // Transition: smooth only when not dragging (phase=idle means React can't know mid-drag,
  // but scale/pan only settle on finger-up so a fast transition works fine)
  const transformStr = displayMode !== 'webtoon'
    ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
    : 'none';

  return (
    // fixed + inset-0 prevents any outer scroll from leaking in on mobile
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden select-none">

      {/* ── TOP BAR ── */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 pb-8 bg-gradient-to-b from-black to-transparent transition-opacity duration-200 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-medium"
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        <span className="text-white text-xs font-bold bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full tabular-nums">
          {page + 1} / {totalPages}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Display mode toggle */}
          <div className="flex bg-black/60 backdrop-blur-sm rounded-full p-0.5">
            {([['single', Layout], ['double', BookOpen], ['webtoon', AlignJustify]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onPointerDown={(e) => { e.stopPropagation(); setDisplayMode(mode); resetZoom(); }}
                className={`p-2 rounded-full transition-colors ${displayMode === mode ? 'bg-[#e50914] text-white' : 'text-gray-400'}`}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center bg-black/60 backdrop-blur-sm rounded-full p-0.5">
            <button onPointerDown={(e) => { e.stopPropagation(); setScale(s => Math.max(1, +(s - 0.25).toFixed(2))); }} className="p-2 text-gray-300 rounded-full">
              <ZoomOut size={13} />
            </button>
            <button onPointerDown={(e) => { e.stopPropagation(); resetZoom(); }} className="text-white text-[11px] font-bold w-10 text-center">
              {Math.round(scale * 100)}%
            </button>
            <button onPointerDown={(e) => { e.stopPropagation(); setScale(s => Math.min(4, +(s + 0.25).toFixed(2))); }} className="p-2 text-gray-300 rounded-full">
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── IMAGE AREA ── */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full"
        style={{
          overflow:    displayMode === 'webtoon' ? 'auto' : 'hidden',
          touchAction: displayMode === 'webtoon' ? 'pan-y'  : 'none',
          // scrollbar-width: none for webtoon (Firefox)
          scrollbarWidth: 'none',
        }}
      >
        {/* Loading spinner */}
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Page(s) wrapper — CSS transform is the ONLY zoom/pan mechanism */}
        <div
          className={`w-full h-full flex ${displayMode === 'webtoon' ? 'flex-col items-center' : 'items-center justify-center'}`}
          style={{
            transform:       transformStr,
            transformOrigin: 'center center',
            // 100ms ease so release feels snappy, not laggy
            transition:      'transform 0.1s ease-out',
            willChange:      'transform',
          }}
        >
          {pageUrls.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={`Página ${page + i + 1}`}
              draggable={false}
              onLoad={() => setImgLoading(false)}
              style={
                displayMode === 'webtoon'
                  ? { width: '100%', height: 'auto', display: 'block', userSelect: 'none' }
                  : {
                    maxWidth:   '100%',
                    maxHeight:  '100%',
                    width:      'auto',
                    height:     'auto',
                    objectFit:  'contain',
                    display:    'block',
                    userSelect: 'none',
                    WebkitUserSelect: 'none' as any,
                  }
              }
            />
          ))}
        </div>
      </div>

      {/* ── DESKTOP click zones (mouse-only devices) ── */}
      {displayMode !== 'webtoon' && !isZoomed && (
        <div className="absolute inset-0 z-20 hidden md:flex pointer-events-auto">
          <div className="w-1/3 h-full cursor-pointer" onClick={() => prevFn.current()} />
          <div className="w-1/3 h-full cursor-pointer" onClick={() => { setShowUI(v => !v); }} />
          <div className="w-1/3 h-full cursor-pointer" onClick={() => nextFn.current()} />
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 px-4 pt-10 bg-gradient-to-t from-black to-transparent transition-opacity duration-200 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <button
            onPointerDown={(e) => { e.stopPropagation(); prevFn.current(); }}
            className="text-white p-2 bg-black/50 hover:bg-black/80 rounded-full flex-shrink-0"
          >
            <ChevronLeft size={26} />
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, totalPages - 1)}
            value={page}
            onChange={e => goFn.current(parseInt(e.target.value))}
            className="flex-1 accent-[#e50914] h-1.5 cursor-pointer"
          />

          <button
            onPointerDown={(e) => { e.stopPropagation(); nextFn.current(); }}
            className="text-white p-2 bg-black/50 hover:bg-black/80 rounded-full flex-shrink-0"
          >
            <ChevronRight size={26} />
          </button>
        </div>

        {isZoomed && (
          <p className="text-center text-gray-500 text-[10px] mt-2">
            Arraste com 1 dedo para explorar · Pinça para ajustar zoom
          </p>
        )}
      </div>
    </div>
  );
};
