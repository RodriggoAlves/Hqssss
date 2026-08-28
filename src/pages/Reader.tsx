import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../services/StorageService';
import { ComicParser } from '../services/ComicParser';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Layout, BookOpen, Smartphone } from 'lucide-react';

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

  // Load page images based on display mode
  useEffect(() => {
    if (!parserRef.current || loading || totalPages === 0) return;
    let isMounted = true;
    
    (async () => {
      try {
        let urlsToLoad: string[] = [];
        
        if (displayMode === 'single') {
          urlsToLoad = [await parserRef.current!.getPageUrl(page)];
        } else if (displayMode === 'double') {
          urlsToLoad.push(await parserRef.current!.getPageUrl(page));
          if (page + 1 < totalPages) {
            urlsToLoad.push(await parserRef.current!.getPageUrl(page + 1));
          }
        } else if (displayMode === 'webtoon') {
          // Load 3 pages vertically for performance (prev, current, next)
          const p = page;
          if (p - 1 >= 0) urlsToLoad.push(await parserRef.current!.getPageUrl(p - 1));
          urlsToLoad.push(await parserRef.current!.getPageUrl(p));
          if (p + 1 < totalPages) urlsToLoad.push(await parserRef.current!.getPageUrl(p + 1));
        }

        if (isMounted) setPageUrls(urlsToLoad);
      } catch (e) {
        console.error('Error loading page:', e);
      }
    })();
    
    return () => { isMounted = false; };
  }, [page, displayMode, loading, totalPages]);

  const go = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    if (id && totalPages > 0) storage.saveProgress(id, clamped, totalPages);
  }, [id, totalPages]);

  const next = useCallback(() => {
    const step = displayMode === 'double' ? 2 : 1;
    go(page + step);
  }, [go, page, displayMode]);
  
  const prev = useCallback(() => {
    const step = displayMode === 'double' ? 2 : 1;
    go(page - step);
  }, [go, page, displayMode]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, navigate]);

  // Auto-hide UI
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
    <div className={`h-screen bg-black flex flex-col select-none ${displayMode === 'webtoon' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      {/* Top bar */}
      <div className={`fixed top-0 left-0 right-0 z-50 p-2 md:p-3 flex justify-between items-center bg-black/80 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => navigate(-1)} className="text-white flex items-center gap-1 md:gap-2 hover:text-red-500 py-2 px-2 md:px-4 rounded">
          <ArrowLeft size={24} /> <span className="hidden md:inline font-semibold">Voltar</span>
        </button>
        
        <div className="flex items-center gap-2 bg-[#2f2f2f] p-1 rounded-lg">
          <button onClick={() => setDisplayMode('single')} className={`p-2 rounded ${displayMode === 'single' ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`} title="1 Página">
            <Layout size={18} />
          </button>
          <button onClick={() => setDisplayMode('double')} className={`p-2 rounded ${displayMode === 'double' ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`} title="2 Páginas">
            <BookOpen size={18} />
          </button>
          <button onClick={() => setDisplayMode('webtoon')} className={`p-2 rounded ${displayMode === 'webtoon' ? 'bg-[#e50914] text-white' : 'text-gray-400 hover:text-white'}`} title="Webtoon">
            <Smartphone size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 md:gap-2 pr-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="text-white p-2 hover:bg-white/10 rounded-full"><ZoomOut size={20} /></button>
          <span className="text-white text-xs md:text-sm w-8 md:w-12 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="text-white p-2 hover:bg-white/10 rounded-full"><ZoomIn size={20} /></button>
        </div>
      </div>

      {/* Image area */}
      <div 
        className={`flex-1 ${displayMode === 'webtoon' ? 'w-full pt-16 pb-20' : 'flex items-center justify-center'}`}
        style={{
          overflow: zoom > 100 ? 'auto' : 'hidden' // Allow scrolling when zoomed in
        }}
      >
        <div 
          className={`transition-transform duration-300 ease-out flex ${displayMode === 'webtoon' ? 'flex-col items-center gap-4 w-full' : 'items-center justify-center h-full'}`}
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: displayMode === 'webtoon' ? 'top center' : 'center center' }}
        >
          {pageUrls.map((url, i) => (
            <img
              key={url + i}
              src={url}
              alt={`Página ${page + i}`}
              draggable={false}
              className={`max-w-full ${displayMode === 'webtoon' ? 'w-full md:w-2/3 lg:w-1/2 object-contain' : 'max-h-screen object-contain'}`}
            />
          ))}
        </div>
      </div>

      {/* Click zones */}
      {displayMode !== 'webtoon' && (
        <div className="fixed inset-0 z-40 flex pointer-events-none">
          <div className="w-1/3 cursor-w-resize pointer-events-auto" onClick={prev} />
          <div className="w-1/3 pointer-events-auto" onClick={() => setShowUI(s => !s)} />
          <div className="w-1/3 cursor-e-resize pointer-events-auto" onClick={next} />
        </div>
      )}

      {/* Bottom navigation */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 p-2 md:p-4 bg-black/80 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="max-w-3xl mx-auto flex items-center gap-2 md:gap-6 px-2">
          <button onClick={prev} className="text-white hover:text-red-500 p-2 md:p-3 rounded-full hover:bg-white/10"><ChevronLeft size={32} /></button>
          
          <div className="flex-1 flex flex-col items-center">
             <span className="text-white text-xs md:text-sm font-medium mb-2">{page + 1} / {totalPages}</span>
             <input
              type="range"
              min={0}
              max={totalPages - 1}
              value={page}
              onChange={e => go(parseInt(e.target.value))}
              className="w-full accent-red-600 h-2 cursor-pointer rounded-lg"
             />
          </div>

          <button onClick={next} className="text-white hover:text-red-500 p-2 md:p-3 rounded-full hover:bg-white/10"><ChevronRight size={32} /></button>
        </div>
      </div>
    </div>
  );
};
