import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

export const Reader: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [showUI, setShowUI] = useState(true);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const parserRef = useRef<ComicParser | null>(null);

  // Load comic file on mount
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const local = await storage.getComic(id);
        const file = await storage.getComicFile(id);
        
        if (!local || !file) {
          navigate('/');
          return;
        }

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

  // Load page image when page changes
  useEffect(() => {
    if (!parserRef.current || loading) return;
    let isMounted = true;
    
    (async () => {
      try {
        const url = await parserRef.current!.getPageUrl(page);
        if (isMounted) setPageUrl(url);
      } catch (e) {
        console.error('Error loading page:', e);
      }
    })();
    
    return () => { isMounted = false; };
  }, [page, loading]);

  const go = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    if (id && totalPages > 0) storage.saveProgress(id, clamped, totalPages);
  }, [id, totalPages]);

  const next = useCallback(() => go(page + 1), [go, page]);
  const prev = useCallback(() => go(page - 1), [go, page]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, navigate]);

  // Auto-hide UI (touch friendly too)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const m = () => { setShowUI(true); clearTimeout(t); t = setTimeout(() => setShowUI(false), 3000); };
    window.addEventListener('mousemove', m);
    window.addEventListener('touchstart', m);
    return () => { 
      window.removeEventListener('mousemove', m); 
      window.removeEventListener('touchstart', m); 
      clearTimeout(t); 
    };
  }, []);

  if (loading || !id || totalPages === 0) {
    return <div className="h-screen bg-black text-white flex items-center justify-center text-lg md:text-xl">Carregando HQ local...</div>;
  }

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">
      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-50 p-2 md:p-3 flex justify-between items-center bg-black/80 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => navigate(-1)} className="text-white flex items-center gap-1 md:gap-2 hover:text-red-500 py-2 px-2 md:px-4 rounded">
          <ArrowLeft size={24} /> <span className="hidden md:inline font-semibold">Voltar</span>
        </button>
        <span className="text-white text-sm md:text-base font-medium">{page + 1} / {totalPages}</span>
        <div className="flex items-center gap-1 md:gap-2 pr-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="text-white p-2 hover:bg-white/10 rounded-full"><ZoomOut size={20} /></button>
          <span className="text-white text-xs md:text-sm w-8 md:w-12 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="text-white p-2 hover:bg-white/10 rounded-full"><ZoomIn size={20} /></button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        {pageUrl && (
          <img
            key={page}
            src={pageUrl}
            alt={`Página ${page + 1}`}
            draggable={false}
            style={{ maxHeight: `${zoom}vh`, width: 'auto', objectFit: 'contain' }}
            className="transition-transform"
          />
        )}
      </div>

      {/* Click zones */}
      <div className="absolute inset-0 z-40 flex">
        <div className="w-1/3 cursor-w-resize" onClick={prev} />
        <div className="w-1/3" onClick={() => setShowUI(s => !s)} />
        <div className="w-1/3 cursor-e-resize" onClick={next} />
      </div>

      {/* Bottom navigation */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 p-2 md:p-4 bg-black/80 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="max-w-3xl mx-auto flex items-center gap-2 md:gap-6 px-2">
          <button onClick={prev} className="text-white hover:text-red-500 p-2 md:p-3 rounded-full hover:bg-white/10"><ChevronLeft size={32} /></button>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={page}
            onChange={e => go(parseInt(e.target.value))}
            className="flex-1 accent-red-600 h-2 cursor-pointer rounded-lg"
          />
          <button onClick={next} className="text-white hover:text-red-500 p-2 md:p-3 rounded-full hover:bg-white/10"><ChevronRight size={32} /></button>
        </div>
      </div>
    </div>
  );
};;
