import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Layout, BookOpen, AlignJustify } from 'lucide-react';

function getDistance(t: TouchList | React.TouchList) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export const Reader: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [showUI, setShowUI] = useState(true);
  const [displayMode, setDisplayMode] = useState<'single' | 'double' | 'webtoon'>('single');
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(false);

  const parserRef = useRef<ComicParser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Touch gesture state
  const touch = useRef({
    startX: 0, startY: 0, startTime: 0,
    lastX: 0, lastY: 0,
    fingers: 0,
    startDist: 0, startZoom: 100,
    moved: false,
  });

  // Load comic
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

  // Load page images
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
          const s = Math.max(0, page - 1), e = Math.min(totalPages - 1, page + 2);
          for (let i = s; i <= e; i++) urls.push(await parserRef.current!.getPageUrl(i));
        } else {
          urls.push(await parserRef.current!.getPageUrl(page));
        }
        if (mounted) { setPageUrls(urls); setImgLoading(false); }
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, [page, displayMode, loading, totalPages]);

  const go = useCallback((p: number) => {
    const c = Math.max(0, Math.min(p, totalPages - 1));
    setPage(c);
    if (id && totalPages > 0) storage.saveProgress(id, c, totalPages);
    if (containerRef.current) { containerRef.current.scrollTop = 0; containerRef.current.scrollLeft = 0; }
  }, [id, totalPages]);

  const step = displayMode === 'double' ? 2 : 1;
  const next = useCallback(() => go(page + step), [go, page, step]);
  const prev = useCallback(() => go(page - step), [go, page, step]);

  // Show UI (desktop hover)
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    const isDesktop = window.matchMedia('(hover: hover)').matches;
    if (!isDesktop) return;
    window.addEventListener('mousemove', showUITemporarily);
    return () => { window.removeEventListener('mousemove', showUITemporarily); clearTimeout(uiTimerRef.current); };
  }, [showUITemporarily]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') navigate('/');
      else if (e.key === 'ArrowDown') containerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
      else if (e.key === 'ArrowUp') containerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(300, z + 25));
      else if (e.key === '-') setZoom(z => Math.max(50, z - 25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, navigate]);

  // Non-passive touchmove to allow preventDefault during pinch
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2) e.preventDefault(); // block browser native zoom
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [loading]);

  // ── TOUCH HANDLERS ──

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches;
    touch.current.fingers = t.length;
    touch.current.moved = false;

    if (t.length === 1) {
      touch.current.startX = t[0].clientX;
      touch.current.startY = t[0].clientY;
      touch.current.lastX = t[0].clientX;
      touch.current.lastY = t[0].clientY;
      touch.current.startTime = Date.now();
    } else if (t.length === 2) {
      touch.current.startDist = getDistance(t);
      touch.current.startZoom = zoom;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches;
    touch.current.moved = true;

    if (t.length === 2) {
      // ── PINCH TO ZOOM ──
      const dist = getDistance(t);
      const scale = dist / touch.current.startDist;
      const newZoom = Math.round(Math.min(300, Math.max(50, touch.current.startZoom * scale)));
      setZoom(newZoom);
    } else if (t.length === 1 && zoom > 100 && displayMode !== 'webtoon') {
      // ── PAN when zoomed (single/double mode) ──
      const dx = touch.current.lastX - t[0].clientX;
      const dy = touch.current.lastY - t[0].clientY;
      if (containerRef.current) {
        containerRef.current.scrollLeft += dx;
        containerRef.current.scrollTop += dy;
      }
      touch.current.lastX = t[0].clientX;
      touch.current.lastY = t[0].clientY;
    }
    // Webtoon: let container's native overflow-y handle scroll
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    // If was a pinch (2 fingers), ignore
    if (touch.current.fingers === 2) { touch.current.fingers = 0; return; }

    const dx = e.changedTouches[0].clientX - touch.current.startX;
    const dy = e.changedTouches[0].clientY - touch.current.startY;
    const dt = Date.now() - touch.current.startTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // TAP: barely moved
    if (absDx < 15 && absDy < 15 && dt < 300) {
      setShowUI(s => !s);
      clearTimeout(uiTimerRef.current);
      return;
    }

    // When zoomed, panning was done in onTouchMove — nothing else to do
    if (zoom > 100 && displayMode !== 'webtoon') return;

    // SWIPE to change page (single/double mode, not zoomed)
    if (displayMode !== 'webtoon' && absDx > 45 && absDx > absDy * 1.2 && dt < 500) {
      if (dx < 0) next();  // swipe left → next
      else prev();           // swipe right → prev
    }
  };

  if (loading || !id) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Carregando...</div>;
  }
  if (totalPages === 0) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Nenhuma página encontrada.</div>;
  }

  const isZoomed = zoom > 100;

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 pt-2 pb-6 bg-gradient-to-b from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white bg-black/50 hover:bg-black/80 backdrop-blur px-3 py-1.5 rounded-full text-sm font-medium transition"
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        <span className="text-white text-xs font-semibold bg-black/60 backdrop-blur px-3 py-1.5 rounded-full">
          {page + 1} / {totalPages}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Display mode */}
          <div className="flex items-center bg-black/60 backdrop-blur rounded-full p-0.5 gap-0.5">
            {([['single', Layout], ['double', BookOpen], ['webtoon', AlignJustify]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => { setDisplayMode(mode); setZoom(100); }}
                className={`p-2 rounded-full transition-colors ${displayMode === mode ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          {/* Zoom */}
          <div className="flex items-center bg-black/60 backdrop-blur rounded-full p-0.5 gap-0.5">
            <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="p-2 text-gray-300 hover:text-white rounded-full transition"><ZoomOut size={14} /></button>
            <button onClick={() => setZoom(100)} className="text-white text-xs font-bold w-10 text-center hover:text-[#e50914] transition">{zoom}%</button>
            <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-2 text-gray-300 hover:text-white rounded-full transition"><ZoomIn size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── IMAGE AREA ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center"
        style={{
          // Always scrollable so scrollBy() works, but touchAction:none means WE control scrolling
          overflow: 'auto',
          touchAction: displayMode === 'webtoon' ? 'pan-y' : 'none', // webtoon: native y scroll
          cursor: isZoomed ? 'grab' : 'default',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Spinner */}
        {imgLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Pages */}
        <div
          className={`flex ${displayMode === 'webtoon' ? 'flex-col items-center w-full' : 'flex-row items-center justify-center gap-0.5'}`}
          style={
            // When zoomed: content is larger than viewport → enables scroll
            // When not zoomed: content fits inside viewport
            isZoomed && displayMode !== 'webtoon'
              ? { minWidth: 'max-content', minHeight: 'max-content' }
              : {}
          }
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
                  ? {
                    width: `${zoom}%`,
                    height: 'auto',
                    maxWidth: 'none',
                    display: 'block'
                  }
                  : isZoomed
                    ? {
                      // Zoomed: scale up from the 100dvh base
                      height: `${zoom}dvh`,
                      width: 'auto',
                      maxWidth: 'none',
                      display: 'block'
                    }
                    : {
                      // Normal: fit entirely within screen
                      maxHeight: '100dvh',
                      maxWidth: '100vw',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block'
                    }
              }
            />
          ))}
        </div>
      </div>

      {/* ── DESKTOP click zones ── */}
      {displayMode !== 'webtoon' && !isZoomed && (
        <div className="absolute inset-0 z-40 hidden md:flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={prev} />
          <div className="w-1/3 h-full" onClick={() => { setShowUI(s => !s); clearTimeout(uiTimerRef.current); }} />
          <div className="w-1/3 h-full cursor-pointer" onClick={next} />
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 px-4 pt-6 pb-5 bg-gradient-to-t from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={prev} className="text-white p-2 hover:bg-white/10 rounded-full transition flex-shrink-0">
            <ChevronLeft size={28} />
          </button>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={page}
            onChange={e => go(parseInt(e.target.value))}
            className="flex-1 accent-[#e50914] h-1.5 cursor-pointer rounded-full"
          />
          <button onClick={next} className="text-white p-2 hover:bg-white/10 rounded-full transition flex-shrink-0">
            <ChevronRight size={28} />
          </button>
        </div>
        {/* Zoom hint when zoomed */}
        {isZoomed && (
          <p className="text-center text-gray-500 text-[10px] mt-2">
            Arraste pra mover · Aperte <span className="text-gray-400">{zoom}%</span> pra resetar o zoom
          </p>
        )}
      </div>
    </div>
  );
};
