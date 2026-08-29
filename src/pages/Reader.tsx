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
  const [zoom, setZoom] = useState(100);
  const [showUI, setShowUI] = useState(true);
  const [displayMode, setDisplayMode] = useState<'single' | 'double' | 'webtoon'>('single');
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(false);

  const parserRef = useRef<ComicParser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Touch state for swipe
  const touchStart = useRef({ x: 0, y: 0, time: 0 });

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
      } catch (e) {
        console.error(e);
        navigate('/');
      }
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
          const start = Math.max(0, page - 1);
          const end = Math.min(totalPages - 1, page + 2);
          for (let i = start; i <= end; i++) urls.push(await parserRef.current!.getPageUrl(i));
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
    // Reset scroll position on page change
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  }, [id, totalPages]);

  const step = displayMode === 'double' ? 2 : 1;
  const next = useCallback(() => go(page + step), [go, page, step]);
  const prev = useCallback(() => go(page - step), [go, page, step]);

  // UI auto-hide
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', showUITemporarily);
    return () => {
      window.removeEventListener('mousemove', showUITemporarily);
      clearTimeout(uiTimerRef.current);
    };
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

  // ── TOUCH SWIPE HANDLING ──
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // When zoomed in, let the browser handle native scroll/pan — don't intercept
    if (zoom > 100) return;

    // Swipe: fast, horizontal, and clearly more horizontal than vertical
    if (absDx > 40 && absDx > absDy * 1.3 && dt < 400 && displayMode !== 'webtoon') {
      if (dx < 0) next();   // swipe left → next page
      else prev();           // swipe right → prev page
      return;
    }

    // Tap (barely moved) → toggle UI
    if (absDx < 12 && absDy < 12) {
      setShowUI(s => !s);
      clearTimeout(uiTimerRef.current);
    }
  };

  if (loading || !id) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Carregando...</div>;
  }

  if (totalPages === 0) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Nenhuma página encontrada.</div>;
  }

  const isZoomed = zoom > 100;

  // Image size style
  // In single/double mode: height = zoom% of viewport height, width auto (may overflow → scroll x)
  // In webtoon mode: width = zoom% of container, height auto (may overflow → scroll y)
  const imgStyle: React.CSSProperties = displayMode === 'webtoon'
    ? { width: `${zoom}%`, height: 'auto', maxWidth: 'none', flexShrink: 0 }
    : { height: `${zoom}dvh`, width: 'auto', maxWidth: 'none', flexShrink: 0 };

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 pt-2 pb-4 bg-gradient-to-b from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
            <span className="text-white text-xs font-bold w-9 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-2 text-gray-300 hover:text-white rounded-full transition"><ZoomIn size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── IMAGE AREA ── */}
      <div
        ref={containerRef}
        className={`flex-1 ${displayMode === 'webtoon' ? 'flex flex-col items-center' : 'flex items-center justify-center'}`}
        style={{
          overflow: isZoomed || displayMode === 'webtoon' ? 'auto' : 'hidden',
          // When zoomed, enable both axes
          overflowX: isZoomed ? 'auto' : 'hidden',
          overflowY: isZoomed || displayMode === 'webtoon' ? 'auto' : 'hidden',
          cursor: isZoomed ? 'grab' : 'default',
          WebkitOverflowScrolling: 'touch' as any,
          touchAction: isZoomed || displayMode === 'webtoon' ? 'pan-x pan-y' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading spinner */}
        {imgLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-7 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Images */}
        <div className={`flex ${displayMode === 'webtoon' ? 'flex-col items-center w-full' : 'flex-row items-center gap-0.5'} ${isZoomed ? '' : 'h-full'}`}>
          {pageUrls.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={`Página ${page + i + 1}`}
              draggable={false}
              onLoad={() => setImgLoading(false)}
              style={imgStyle}
            />
          ))}
        </div>
      </div>

      {/* ── DESKTOP CLICK ZONES (no mobile) ── */}
      {displayMode !== 'webtoon' && !isZoomed && (
        <div className="absolute inset-0 z-40 hidden md:flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={prev} />
          <div className="w-1/3 h-full" onClick={() => { setShowUI(s => !s); clearTimeout(uiTimerRef.current); }} />
          <div className="w-1/3 h-full cursor-pointer" onClick={next} />
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 px-4 pb-safe pt-3 pb-5 bg-gradient-to-t from-black/95 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={prev} className="text-white p-2 hover:bg-white/10 rounded-full transition flex-shrink-0">
            <ChevronLeft size={26} />
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
            <ChevronRight size={26} />
          </button>
        </div>
      </div>
    </div>
  );
};
