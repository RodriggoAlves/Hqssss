import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

const API = import.meta.env.PROD ? '' : 'http://localhost:3001';

export const Reader: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [, setComic] = useState<Comic | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [showUI, setShowUI] = useState(true);

  // Load comic on mount
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const info = await fetch(`${API}/api/comic/${id}/info`).then(r => r.json());
        const local = await storage.getComic(id);
        setTotalPages(info.totalPages);
        setPage(local?.currentPage ?? 0);
        setComic({ id, title: '', fileName: '', format: 'cbr', totalPages: info.totalPages, fileSize: 0, coverImage: '', progress: 0, currentPage: local?.currentPage ?? 0, lastRead: 0 } as Comic);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [id]);

  const go = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    if (id) storage.saveProgress(id, clamped, totalPages);
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

  // Auto-hide UI
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const m = () => { setShowUI(true); clearTimeout(t); t = setTimeout(() => setShowUI(false), 3000); };
    window.addEventListener('mousemove', m);
    return () => { window.removeEventListener('mousemove', m); clearTimeout(t); };
  }, []);

  if (!id || totalPages === 0) return <div className="h-screen bg-black text-white flex items-center justify-center">Carregando...</div>;

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-50 p-3 flex justify-between items-center bg-black/70 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => navigate('/')} className="text-white flex items-center gap-1 hover:text-red-500">
          <ArrowLeft size={20} /> Voltar
        </button>
        <span className="text-white text-sm">{page + 1} / {totalPages}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="text-white"><ZoomOut size={18} /></button>
          <span className="text-white text-xs w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="text-white"><ZoomIn size={18} /></button>
        </div>
      </div>

      {/* Image area — CDisplay style: just the image, centered */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <img
          key={page}
          src={`${API}/api/comic/${id}/page/${page}`}
          alt={`Página ${page + 1}`}
          draggable={false}
          style={{ maxHeight: `${zoom}vh`, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* Click zones: left 1/3 = prev, right 1/3 = next */}
      <div className="absolute inset-0 z-40 flex">
        <div className="w-1/3 cursor-w-resize" onClick={prev} />
        <div className="w-1/3" onClick={() => setShowUI(s => !s)} />
        <div className="w-1/3 cursor-e-resize" onClick={next} />
      </div>

      {/* Bottom navigation */}
      <div className={`absolute bottom-0 left-0 right-0 z-50 p-3 bg-black/70 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={prev} className="text-white hover:text-red-500"><ChevronLeft size={28} /></button>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={page}
            onChange={e => go(parseInt(e.target.value))}
            className="flex-1 accent-red-600 h-1 cursor-pointer"
          />
          <button onClick={next} className="text-white hover:text-red-500"><ChevronRight size={28} /></button>
        </div>
      </div>
    </div>
  );
};
