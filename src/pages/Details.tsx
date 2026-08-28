import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ArrowLeft, Play, Trash2, Info } from 'lucide-react';

const API = import.meta.env.PROD ? '' : 'http://localhost:3001';

export const Details: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [comic, setComic] = useState<Comic | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const response = await fetch(`${API}/api/comics`);
        const data = await response.json();
        const c = data.find((x: any) => x.id === id);
        
        if (c) {
          const infoResp = await fetch(`${API}/api/comic/${id}/info`);
          const info = await infoResp.json();
          const local = await storage.getComic(id);
          
          setComic({
            ...c,
            totalPages: info.totalPages,
            progress: local ? local.progress : 0,
            currentPage: local ? local.currentPage : 0,
            lastRead: local ? local.lastRead : 0
          });
        } else {
          navigate('/');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!comic || !window.confirm('Tem certeza que deseja excluir este quadrinho da biblioteca?')) return;
    
    setDeleting(true);
    try {
      await fetch(`${API}/api/comic/${comic.id}`, { method: 'DELETE' });
      await storage.deleteComic(comic.id);
      navigate('/');
    } catch (e) {
      console.error('Error deleting:', e);
      setDeleting(false);
      alert('Erro ao excluir');
    }
  };

  if (loading || !comic) {
    return <div className="min-h-screen pt-20 px-8 text-center text-xl">Carregando detalhes...</div>;
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const progressPercent = comic.totalPages ? Math.round((comic.currentPage / (comic.totalPages - 1)) * 100) : 0;

  return (
    <div className="min-h-screen relative">
      {/* Background with blur */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${comic.coverImage})`, filter: 'blur(30px)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/80 to-transparent" />

      <div className="relative z-10 pt-20 px-8 max-w-6xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition mb-8"
        >
          <ArrowLeft size={24} />
          <span className="font-semibold text-lg">Voltar</span>
        </button>

        <div className="flex flex-col md:flex-row gap-10">
          {/* Cover */}
          <div className="w-full md:w-1/3 max-w-sm flex-shrink-0">
            <img 
              src={comic.coverImage} 
              alt={comic.title}
              className="w-full rounded-lg shadow-2xl shadow-black/50"
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-4">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">{comic.title}</h1>
            
            <div className="flex items-center gap-4 text-gray-400 text-sm md:text-base font-medium mb-8">
              <span className="bg-white/10 px-2 py-1 rounded">{comic.format.toUpperCase()}</span>
              <span>•</span>
              <span>{comic.totalPages} páginas</span>
              <span>•</span>
              <span>{formatSize(comic.fileSize)}</span>
            </div>

            {/* Read Button */}
            <div className="flex flex-wrap gap-4 mb-10">
              <button 
                onClick={() => navigate(`/read/${comic.id}`)}
                className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded text-xl font-bold hover:bg-gray-200 transition"
              >
                <Play size={28} fill="currentColor" />
                {progressPercent > 0 && progressPercent < 100 ? 'CONTINUAR LENDO' : 'LER AGORA'}
              </button>
              
              <button 
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 bg-red-600/80 text-white px-6 py-3 rounded text-lg font-semibold hover:bg-red-600 transition ml-auto"
              >
                <Trash2 size={24} />
                {deleting ? 'EXCLUINDO...' : 'EXCLUIR'}
              </button>
            </div>

            {/* Progress */}
            {progressPercent > 0 && (
              <div className="bg-[#2f2f2f] rounded-lg p-6 max-w-md">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-gray-300 font-medium">Progresso</span>
                  <span className="text-xl font-bold">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-netflix-red transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-gray-400 text-sm mt-3 flex items-center gap-2">
                  <Info size={16} />
                  Página {comic.currentPage + 1} de {comic.totalPages}
                </p>
              </div>
            )}
            
            {/* File Info */}
            <div className="mt-8 pt-8 border-t border-gray-800">
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Informações do Arquivo</h3>
              <p className="text-gray-500 text-sm">{comic.fileName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
