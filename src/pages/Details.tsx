import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ArrowLeft, Play, Trash2, Info, Edit3, Check, ChevronLeft, ChevronRight } from 'lucide-react';

export const Details: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [comic, setComic] = useState<Comic | null>(null);
  const [siblings, setSiblings] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [editTopicValue, setEditTopicValue] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const c = await storage.getComic(id);
        if (c) {
          setComic(c);
          setEditTopicValue(c.series || 'Geral');

          // Load siblings (same series/topic), sorted A-Z
          const all = await storage.getAllComics();
          const same = all
            .filter(x => x.series === c.series && x.id !== c.id)
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
          setSiblings(same);
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
      await storage.deleteComic(comic.id);
      navigate('/');
    } catch (e) {
      console.error('Error deleting:', e);
      setDeleting(false);
      alert('Erro ao excluir');
    }
  };

  const handleSaveTopic = async () => {
    if (!comic) return;
    try {
      const updatedComic = { ...comic, series: editTopicValue.trim() || 'Geral' };
      await storage.saveComic(updatedComic);
      setComic(updatedComic);
      setIsEditingTopic(false);
    } catch(e) {
      alert('Erro ao salvar tópico');
    }
  };

  if (loading || !comic) {
    return <div className="min-h-screen pt-20 px-8 text-center text-xl text-white">Carregando...</div>;
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const progressPercent = comic.totalPages ? Math.round((comic.currentPage / (comic.totalPages - 1)) * 100) : 0;

  // Sorted list with current comic included for the edition selector
  const allInSeries = [comic, ...siblings].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true })
  );
  const currentIndex = allInSeries.findIndex(c => c.id === comic.id);
  const prevComic = currentIndex > 0 ? allInSeries[currentIndex - 1] : null;
  const nextComic = currentIndex < allInSeries.length - 1 ? allInSeries[currentIndex + 1] : null;

  return (
    <div className="min-h-screen relative text-white">
      {/* Blurred background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${comic.coverImage})`, filter: 'blur(40px)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/90 to-[#141414]/60" />

      <div className="relative z-10 pt-16 px-4 md:px-10 max-w-5xl mx-auto pb-16">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition mb-6 text-sm"
        >
          <ArrowLeft size={18} />
          <span className="font-medium">Voltar</span>
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Cover */}
          <div className="w-48 md:w-56 flex-shrink-0 mx-auto md:mx-0">
            <img
              src={comic.coverImage}
              alt={comic.title}
              className="w-full rounded-lg shadow-2xl shadow-black/80"
            />
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl md:text-4xl font-bold mb-2 leading-tight">{comic.title}</h1>

            <div className="flex flex-wrap items-center gap-3 text-gray-400 text-xs md:text-sm font-medium mb-5">
              <span className="bg-white/10 px-2 py-0.5 rounded uppercase">{comic.format}</span>
              <span>•</span>
              <span>{comic.totalPages} pág.</span>
              <span>•</span>
              <span>{formatSize(comic.fileSize)}</span>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => navigate(`/read/${comic.id}`)}
                className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded text-sm font-bold hover:bg-gray-200 transition"
              >
                <Play size={18} fill="currentColor" />
                {progressPercent > 0 && progressPercent < 100 ? 'CONTINUAR' : 'LER AGORA'}
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 bg-red-600/70 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-600 transition"
              >
                <Trash2 size={16} />
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>

            {/* Progress */}
            {progressPercent > 0 && (
              <div className="bg-[#2f2f2f] rounded-lg p-4 max-w-sm mb-5">
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-gray-300 text-sm font-medium">Progresso</span>
                  <span className="text-base font-bold">{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e50914] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-gray-400 text-xs mt-2 flex items-center gap-1.5">
                  <Info size={13} />
                  Página {comic.currentPage + 1} de {comic.totalPages}
                </p>
              </div>
            )}

            {/* Topic editor */}
            <div className="mb-5 flex items-center gap-3 max-w-sm">
              <div className="flex-1">
                <span className="text-gray-500 text-xs uppercase tracking-wider block mb-0.5">Coleção</span>
                {isEditingTopic ? (
                  <input
                    type="text"
                    value={editTopicValue}
                    onChange={e => setEditTopicValue(e.target.value)}
                    className="w-full bg-[#141414] border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-red-500 outline-none"
                    placeholder="Nome do Tópico..."
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveTopic()}
                  />
                ) : (
                  <span className="text-base font-semibold">{comic.series || 'Geral'}</span>
                )}
              </div>
              {isEditingTopic ? (
                <button onClick={handleSaveTopic} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition mt-4">
                  <Check size={13} /> Salvar
                </button>
              ) : (
                <button onClick={() => setIsEditingTopic(true)} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition mt-4">
                  <Edit3 size={13} /> Editar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Netflix-style Edition Selector */}
        {allInSeries.length > 1 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                Edições da Coleção
                <span className="ml-2 text-sm font-normal text-gray-400">({allInSeries.length} no total)</span>
              </h2>
              {/* Prev / Next quick nav */}
              <div className="flex gap-2">
                <button
                  disabled={!prevComic}
                  onClick={() => prevComic && navigate(`/details/${prevComic.id}`)}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded text-xs font-semibold transition"
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  disabled={!nextComic}
                  onClick={() => nextComic && navigate(`/details/${nextComic.id}`)}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded text-xs font-semibold transition"
                >
                  Próxima <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Horizontal scrollable grid — like Netflix episodes */}
            <div
              className="flex gap-3 overflow-x-auto pb-3"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {allInSeries.map((c, idx) => {
                const isCurrent = c.id === comic.id;
                const prog = c.totalPages ? Math.round((c.currentPage / (c.totalPages - 1)) * 100) : 0;
                return (
                  <div
                    key={c.id}
                    onClick={() => !isCurrent && navigate(`/details/${c.id}`)}
                    className={`flex-shrink-0 w-28 md:w-36 rounded-lg overflow-hidden cursor-pointer transition-all duration-200
                      ${isCurrent
                        ? 'ring-2 ring-[#e50914] opacity-100 scale-105'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                  >
                    <div className="relative">
                      {c.coverImage && (
                        <img src={c.coverImage} alt={c.title} className="w-full aspect-[2/3] object-cover" />
                      )}
                      {isCurrent && (
                        <div className="absolute inset-0 bg-[#e50914]/20 flex items-center justify-center">
                          <span className="bg-[#e50914] text-white text-xs font-bold px-2 py-0.5 rounded">ATUAL</span>
                        </div>
                      )}
                      {prog > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                          <div className="h-full bg-[#e50914]" style={{ width: `${prog}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 bg-[#1a1a1a]">
                      <p className="text-white text-xs font-medium line-clamp-2 leading-tight">{c.title}</p>
                      <p className="text-gray-500 text-[10px] mt-0.5">#{idx + 1}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* File info */}
        <div className="mt-8 pt-6 border-t border-gray-800">
          <p className="text-gray-500 text-xs font-mono break-all">{comic.fileName}</p>
        </div>
      </div>
    </div>
  );
};
