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
  const [imgLoading, setImgLoading] = useState(true);

  const parserRef = useRef<ComicParser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
          // Load a window of pages for vertical reading
          const start = Math.max(0, page - 1);
          const end = Math.min(totalPages - 1, page + 2);
          for (let i = start; i <= end; i++) {
            urls.push(await parserRef.current!.getPageUrl(i));
          }
        } else {
          urls.push(await parserRef.current!.getPageUrl(page));
        }
        if (mounted) {
          setPageUrls(urls);
          setImgLoading(false);
        }
      } catch (e) { console.error(e); }
    })();

    return () => { mounted = false; };
  }, [page, displayMode, loading, totalPages]);

  const go = useCallback((p: number) => {
    const c = Math.max(0, Math.min(p, totalPages - 1));
    setPage(c);
    if (id && totalPages > 0) storage.saveProgress(id, c, totalPages);
    // Reset scroll on page change
    if (containerRef.current) containerRef.current.scrollTop = 0;
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
    window.addEventListener('touchstart', showUITemporarily, { passive: true });
    return () => {
      window.removeEventListener('mousemove', showUITemporarily);
      window.removeEventListener('touchstart', showUITemporarily);
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

  if (loading || !id) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Carregando...</div>;
  }

  if (totalPages === 0) {
    return <div className="h-screen bg-black text-gray-400 flex items-center justify-center">Nenhuma página encontrada.</div>;
  }

  const isZoomed = zoom !== 100;

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden relative">

      {/* ── TOP BAR ── */}
      <div className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/90 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white bg-black/40 hover:bg-black/70 backdrop-blur px-3 py-1.5 rounded-full text-sm font-medium transition"
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        {/* Page counter */}
        <span className="text-white text-xs font-semibold bg-black/50 backdrop-blur px-3 py-1.5 rounded-full">
          {page + 1} / {totalPages}
        </span>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          {/* Display mode */}
          <div className="flex items-center bg-black/50 backdrop-blur rounded-full p-0.5 gap-0.5">
            {([['single', Layout], ['double', BookOpen], ['webtoon', AlignJustify]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setDisplayMode(mode)}
                className={`p-2 rounded-full transition ${displayMode === mode ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>

          {/* Zoom */}
          <div className="flex items-center bg-black/50 backdrop-blur rounded-full p-0.5 gap-0.5">
            <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="p-2 text-gray-300 hover:text-white rounded-full transition"><ZoomOut size={15} /></button>
            <span className="text-white text-xs font-semibold w-9 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-2 text-gray-300 hover:text-white rounded-full transition"><ZoomIn size={15} /></button>
          </div>
        </div>
      </div>

      {/* ── IMAGE AREA ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center"
        style={{ overflow: isZoomed || displayMode === 'webtoon' ? 'auto' : 'hidden' }}
      >
        {/* Loading spinner */}
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div
          className={`flex ${displayMode === 'webtoon' ? 'flex-col items-center w-full gap-1' : 'items-center justify-center'}`}
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: isZoomed ? 'top center' : 'center center',
            transition: 'transform 0.2s ease',
            minHeight: displayMode !== 'webtoon' ? '100%' : undefined,
          }}
        >
          {pageUrls.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={`Página ${page + i + 1}`}
              draggable={false}
              onLoad={() => setImgLoading(false)}
              className={
                displayMode === 'webtoon'
                  ? 'w-full max-w-2xl object-contain'
                  : 'max-h-screen max-w-full object-contain'
              }
              style={
                displayMode !== 'webtoon'
                  ? { height: '100dvh', objectFit: 'contain' }
                  : {}
              }
            />
          ))}
        </div>
      </div>

      {/* ── CLICK ZONES (single/double) ── */}
      {displayMode !== 'webtoon' && (
        <div className={`absolute inset-0 z-40 flex ${showUI ? 'pointer-events-none' : ''}`}
             style={{ pointerEvents: 'auto' }}>
          <div className="w-1/3 h-full cursor-pointer" onClick={prev} />
          <div className="w-1/3 h-full" onClick={() => { setShowUI(s => !s); clearTimeout(uiTimerRef.current); }} />
          <div className="w-1/3 h-full cursor-pointer" onClick={next} />
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 px-3 py-3 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
      </div>
    </div>
  );
};
