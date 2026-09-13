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

  // ── LOAD PAGES: single / double ──
  useEffect(() => {
    if (displayMode === 'webtoon') return;
    if (!parserRef.current || loading || totalPages === 0) return;
    let mounted = true;
    setImgLoading(true);
    (async () => {
      try {
        const urls: string[] = [];
        if (displayMode === 'double') {
          urls.push(await parserRef.current!.getPageUrl(page));
          if (page + 1 < totalPages) urls.push(await parserRef.current!.getPageUrl(page + 1));
        } else {
          urls.push(await parserRef.current!.getPageUrl(page));
        }
        if (mounted) { setPageUrls(urls); setImgLoading(false); }
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, [page, displayMode, loading, totalPages]);

  // ── WEBTOON: state for all pages ──
  const [webtoonUrls, setWebtoonUrls] = useState<(string | null)[]>([]);
  const pageElsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Load ALL pages progressively when entering webtoon mode
  useEffect(() => {
    if (displayMode !== 'webtoon') return;
    if (!parserRef.current || loading || totalPages === 0) return;
    let mounted = true;

    setWebtoonUrls(new Array(totalPages).fill(null));

    (async () => {
      for (let i = 0; i < totalPages; i++) {
        if (!mounted) break;
        try {
          const url = await parserRef.current!.getPageUrl(i);
          if (!mounted) break;
          setWebtoonUrls(prev => {
            const next = [...prev];
            next[i] = url;
            return next;
          });
        } catch (e) { console.error('webtoon page', i, e); }
      }
    })();

    return () => { mounted = false; };
  }, [displayMode, loading, totalPages]);

  // IntersectionObserver: update page counter as user scrolls in webtoon
  useEffect(() => {
    if (displayMode !== 'webtoon') return;
    const els = pageElsRef.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
          }
        }
        if (best) {
          const idx = parseInt((best.target as HTMLElement).dataset.pageindex ?? '0', 10);
          setPage(idx);
          if (id && totalPages > 0) storage.saveProgress(id, idx, totalPages);
        }
      },
      { threshold: [0.1, 0.5], root: containerRef.current }
    );

    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, webtoonUrls.length, id, totalPages]);

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
      // Zoom persists across pages — only pan resets so the new page starts centered
      setPan({ x: 0, y: 0 });
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

  // ── TOUCH GESTURE ENGINE ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading) return;

    // ── WEBTOON MODE ──
    // Native browser handles scroll (overflow-y: auto + touchAction: pan-y pinch-zoom).
    // We only intercept click to toggle UI.
    if (displayMode === 'webtoon') {
      const onTap = () => {
        setShowUI(v => !v);
        clearTimeout(uiTimerRef.current);
      };
      el.addEventListener('click', onTap);
      return () => el.removeEventListener('click', onTap);
    }

    // ── SINGLE / DOUBLE MODE ──
    // Full custom gesture engine: tap, swipe, pan, pinch — all via JS transforms.
    const g = {
      phase: 'idle' as 'idle' | 'maybe-tap' | 'swipe' | 'pan' | 'pinch',
      startX: 0, startY: 0, startTime: 0,
      lastX: 0, lastY: 0,
      wasZoomed: false,
      pinchStartDist: 0, pinchStartScale: 1,
    };

    const fingerDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;
      if (t.length === 1) {
        g.phase     = 'maybe-tap';
        g.wasZoomed = scaleRef.current > 1;
        g.startX    = g.lastX = t[0].clientX;
        g.startY    = g.lastY = t[0].clientY;
        g.startTime = Date.now();
      } else if (t.length === 2) {
        g.phase           = 'pinch';
        g.pinchStartDist  = fingerDist(t);
        g.pinchStartScale = scaleRef.current;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;

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

      if (g.phase === 'maybe-tap' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        g.phase = g.wasZoomed ? 'pan' : 'swipe';
      }

      if (g.phase === 'pan') {
        const moveDx = t[0].clientX - g.lastX;
        const moveDy = t[0].clientY - g.lastY;
        g.lastX = t[0].clientX;
        g.lastY = t[0].clientY;
        const s = scaleRef.current;
        setPan(prev => {
          const maxX = (el.clientWidth  * (s - 1)) / 2;
          const maxY = (el.clientHeight * (s - 1)) / 2;
          return {
            x: Math.max(-maxX, Math.min(maxX, prev.x + moveDx)),
            y: Math.max(-maxY, Math.min(maxY, prev.y + moveDy)),
          };
        });
      }
    };

    const onEnd = (e: TouchEvent) => {
      const phase = g.phase;
      g.phase = 'idle';

      if (phase === 'pinch') return;

      if (phase === 'maybe-tap') {
        setShowUI(v => !v);
        clearTimeout(uiTimerRef.current);
        return;
      }

      if (phase === 'swipe' && e.changedTouches.length === 1 && scaleRef.current <= 1) {
        const dx = e.changedTouches[0].clientX - g.startX;
        const dy = e.changedTouches[0].clientY - g.startY;
        const dt = Date.now() - g.startTime;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 500) {
          if (dx < 0) nextFn.current();
          else prevFn.current();
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
  }, [loading, displayMode]); // re-run when mode changes to attach correct listeners

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
          // pan-y pinch-zoom: allows native vertical scroll AND native pinch-to-zoom in webtoon
          touchAction: displayMode === 'webtoon' ? 'pan-y pinch-zoom' : 'none',
          scrollbarWidth: 'none',
        }}
      >
        {/* Loading spinner */}
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Page(s) wrapper — CSS transform handles zoom/pan in single/double */}
        {displayMode === 'webtoon' ? (
          // WEBTOON: native scroll, all pages stacked vertically
          <div className="w-full flex flex-col items-center">
            {webtoonUrls.map((url, i) => (
              <div
                key={i}
                ref={el => { pageElsRef.current[i] = el; }}
                data-pageindex={i}
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
                  // Placeholder while page is loading
                  <div
                    className="w-full flex items-center justify-center bg-black"
                    style={{ minHeight: '60vw' }}
                  >
                    <div className="w-6 h-6 border-2 border-[#e50914]/40 border-t-[#e50914] rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}
            {/* End-of-comic marker */}
            {webtoonUrls.length > 0 && webtoonUrls.every(u => u !== null) && (
              <div className="w-full flex flex-col items-center gap-3 py-12 text-gray-600">
                <span className="text-2xl">✓</span>
                <span className="text-sm font-medium">Fim do quadrinho</span>
                <button
                  onClick={() => navigate(-1)}
                  className="mt-2 bg-[#e50914] text-white px-5 py-2 rounded-full text-sm font-semibold"
                >
                  Voltar à biblioteca
                </button>
              </div>
            )}
          </div>
        ) : (
          // SINGLE / DOUBLE: CSS transform zoom+pan
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform:       transformStr,
              transformOrigin: 'center center',
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
                style={{
                  maxWidth:   '100%',
                  maxHeight:  '100%',
                  width:      'auto',
                  height:     'auto',
                  objectFit:  'contain',
                  display:    'block',
                  userSelect: 'none',
                  WebkitUserSelect: 'none' as any,
                }}
              />
            ))}
          </div>
        )}
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
