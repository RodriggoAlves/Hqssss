import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Layout, BookOpen, AlignJustify } from 'lucide-react';

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

  // Transform state (Zoom & Pan)
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const parserRef = useRef<ComicParser | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch gesture refs
  const touchState = useRef({
    type: 'none', // 'pan', 'pinch', 'swipe'
    startX: 0, startY: 0,
    startPanX: 0, startPanY: 0,
    startDist: 0, startScale: 1,
    startTime: 0,
    lastX: 0, lastY: 0
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

  // Load pages
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

  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const go = useCallback((p: number) => {
    const c = Math.max(0, Math.min(p, totalPages - 1));
    setPage(c);
    resetZoom(); // Reset zoom on page turn!
    if (id && totalPages > 0) storage.saveProgress(id, c, totalPages);
    if (displayMode === 'webtoon' && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [id, totalPages, resetZoom, displayMode]);

  const step = displayMode === 'double' ? 2 : 1;
  const next = useCallback(() => go(page + step), [go, page, step]);
  const prev = useCallback(() => go(page - step), [go, page, step]);

  // Block native gestures (like swipe-to-go-back or double-tap zoom) so our JS can handle them
  useEffect(() => {
    const preventNative = (e: TouchEvent) => {
      if (displayMode !== 'webtoon') e.preventDefault();
    };
    document.addEventListener('touchmove', preventNative, { passive: false });
    return () => document.removeEventListener('touchmove', preventNative);
  }, [displayMode]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') navigate('/');
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(4, s + 0.25));
      else if (e.key === '-') setScale(s => Math.max(1, s - 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, navigate]);

  // UI Auto-hide (Desktop)
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('mousemove', showUITemporarily);
      return () => { window.removeEventListener('mousemove', showUITemporarily); clearTimeout(uiTimerRef.current); };
    }
    return () => clearTimeout(uiTimerRef.current);
  }, [showUITemporarily]);

  // ── TOUCH GESTURE ENGINE (Pan, Pinch, Swipe, Tap) ──
  const onTouchStart = (e: React.TouchEvent) => {
    if (displayMode === 'webtoon') return;
    const t = e.touches;
    if (t.length === 1) {
      touchState.current = {
        type: scale > 1 ? 'pan' : 'swipe',
        startX: t[0].clientX, startY: t[0].clientY,
        lastX: t[0].clientX, lastY: t[0].clientY,
        startPanX: pan.x, startPanY: pan.y,
        startDist: 0, startScale: scale,
        startTime: Date.now()
      };
    } else if (t.length === 2) {
      touchState.current = {
        type: 'pinch',
        startX: (t[0].clientX + t[1].clientX) / 2,
        startY: (t[0].clientY + t[1].clientY) / 2,
        lastX: 0, lastY: 0,
        startPanX: pan.x, startPanY: pan.y,
        startDist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
        startScale: scale,
        startTime: Date.now()
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (displayMode === 'webtoon') return;
    const t = e.touches;
    const state = touchState.current;

    if (state.type === 'pinch' && t.length === 2) {
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const newScale = Math.max(1, Math.min(4, state.startScale * (dist / state.startDist)));
      setScale(newScale);
      if (newScale === 1) setPan({ x: 0, y: 0 });
    } else if (state.type === 'pan' && t.length === 1) {
      const dx = t[0].clientX - state.startX;
      const dy = t[0].clientY - state.startY;
      setPan({ x: state.startPanX + dx, y: state.startPanY + dy });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (displayMode === 'webtoon') return;
    const state = touchState.current;
    if (state.type === 'none') return;

    const dt = Date.now() - state.startTime;

    if (state.type === 'swipe' && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - state.startX;
      const dy = e.changedTouches[0].clientY - state.startY;

      // TAP (barely moved)
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
        setShowUI(s => !s);
        clearTimeout(uiTimerRef.current);
      } 
      // SWIPE (moved mostly horizontally and fast)
      else if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
        if (dx < 0) next(); else prev();
      }
    }

    state.type = 'none';
  };

  if (loading || !id) return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Carregando...</div>;
  if (totalPages === 0) return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Sem páginas.</div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden relative">

      {/* ── TOP BAR ── */}
      <div className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 pt-2 pb-6 bg-gradient-to-b from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-white bg-black/50 hover:bg-black/80 backdrop-blur px-3 py-1.5 rounded-full text-sm font-medium transition">
          <ArrowLeft size={16} /> Voltar
        </button>

        <span className="text-white text-xs font-semibold bg-black/60 backdrop-blur px-3 py-1.5 rounded-full">
          {page + 1} / {totalPages}
        </span>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-black/60 backdrop-blur rounded-full p-0.5 gap-0.5">
            {([['single', Layout], ['double', BookOpen], ['webtoon', AlignJustify]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => { setDisplayMode(mode); resetZoom(); }}
                className={`p-2 rounded-full transition-colors ${displayMode === mode ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          <div className="flex items-center bg-black/60 backdrop-blur rounded-full p-0.5 gap-0.5">
            <button onClick={() => setScale(s => Math.max(1, s - 0.25))} className="p-2 text-gray-300 hover:text-white rounded-full"><ZoomOut size={14} /></button>
            <button onClick={resetZoom} className="text-white text-xs font-bold w-11 text-center hover:text-[#e50914]">{Math.round(scale * 100)}%</button>
            <button onClick={() => setScale(s => Math.min(4, s + 0.25))} className="p-2 text-gray-300 hover:text-white rounded-full"><ZoomIn size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── IMAGE AREA ── */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full relative"
        style={{
          overflow: displayMode === 'webtoon' ? 'auto' : 'hidden', // only webtoon gets native scroll
          touchAction: displayMode === 'webtoon' ? 'pan-y' : 'none' // block browser handling to allow our JS transform
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {imgLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div
          className={`w-full h-full flex ${displayMode === 'webtoon' ? 'flex-col items-center' : 'items-center justify-center gap-0.5'}`}
          style={{
            // ── THIS IS THE MAGIC ──
            // We use CSS transforms instead of native scrollbars.
            // This bypasses the browser's negative overflow limitations completely!
            transform: displayMode !== 'webtoon' ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})` : 'none',
            transformOrigin: 'center center',
            transition: touchState.current.type === 'none' ? 'transform 0.15s ease-out' : 'none', // Smooth snap, instant drag
            willChange: 'transform'
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
                  ? { width: '100%', height: 'auto', display: 'block' }
                  : { maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }
              }
            />
          ))}
        </div>
      </div>

      {/* ── DESKTOP click zones ── */}
      {displayMode !== 'webtoon' && scale === 1 && (
        <div className="absolute inset-0 z-40 hidden md:flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={prev} />
          <div className="w-1/3 h-full" onClick={() => { setShowUI(s => !s); clearTimeout(uiTimerRef.current); }} />
          <div className="w-1/3 h-full cursor-pointer" onClick={next} />
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 px-4 pt-6 pb-6 bg-gradient-to-t from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
        {scale > 1 && (
          <p className="text-center text-gray-500 text-xs mt-3">
            Arraste para explorar a página livremente
          </p>
        )}
      </div>
    </div>
  );
};
