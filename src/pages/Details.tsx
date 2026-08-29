import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ArrowLeft, Play, Trash2, Edit3, Check, ChevronLeft, ChevronRight } from 'lucide-react';

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
          const all = await storage.getAllComics();
          const same = all
            .filter(x => x.series === c.series)
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
    if (!comic || !window.confirm('Excluir este quadrinho da biblioteca?')) return;
    setDeleting(true);
    try {
      await storage.deleteComic(comic.id);
      navigate('/');
    } catch {
      setDeleting(false);
    }
  };

  const handleSaveTopic = async () => {
    if (!comic) return;
    const updated = { ...comic, series: editTopicValue.trim() || 'Geral' };
    await storage.saveComic(updated);
    setComic(updated);
    setIsEditingTopic(false);
  };

  if (loading || !comic) {
    return (
      <div className="h-screen bg-[#0f0f0f] flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  const formatSize = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const prog = comic.totalPages ? Math.round((comic.currentPage / (comic.totalPages - 1)) * 100) : 0;

  const currentIndex = siblings.findIndex(c => c.id === comic.id);
  const prevComic = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextComic = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {/* ── HERO BANNER ── */}
      <div className="relative w-full" style={{ height: 'min(60vh, 480px)' }}>
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${comic.coverImage})`,
            filter: 'blur(24px) brightness(0.3)',
            transform: 'scale(1.08)'
          }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/20 to-black/40" />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-gray-300 hover:text-white transition bg-black/30 backdrop-blur px-3 py-1.5 rounded-full text-sm"
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end gap-6 px-5 md:px-10 pb-8">
          {/* Cover */}
          <img
            src={comic.coverImage}
            alt={comic.title}
            className="hidden md:block w-36 rounded-xl shadow-2xl flex-shrink-0 ring-1 ring-white/10"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#e50914] font-bold uppercase tracking-widest mb-1">{comic.series || 'Geral'}</p>
            <h1 className="text-2xl md:text-4xl font-black leading-tight mb-3 line-clamp-2">{comic.title}</h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 text-gray-400 text-xs mb-4">
              <span className="bg-white/10 px-2 py-0.5 rounded uppercase font-semibold">{comic.format}</span>
              <span>{comic.totalPages} páginas</span>
              <span>·</span>
              <span>{formatSize(comic.fileSize)}</span>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate(`/read/${comic.id}`)}
                className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded-full text-sm font-bold hover:bg-gray-100 transition"
              >
                <Play size={16} fill="currentColor" />
                {prog > 0 && prog < 100 ? 'Continuar' : 'Ler Agora'}
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm font-semibold transition"
              >
                <Trash2 size={15} />
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="px-5 md:px-10 pb-20 max-w-4xl mx-auto">

        {/* Progress */}
        {prog > 0 && (
          <div className="mt-4 mb-6 bg-[#1a1a1a] rounded-xl p-4">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Progresso de leitura</span>
              <span className="font-bold text-white">{prog}% · Pág. {comic.currentPage + 1}/{comic.totalPages}</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-[#e50914] rounded-full" style={{ width: `${prog}%` }} />
            </div>
          </div>
        )}

        {/* Collection tag editor */}
        <div className="mt-4 mb-6 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Coleção</p>
            {isEditingTopic ? (
              <input
                type="text"
                value={editTopicValue}
                onChange={e => setEditTopicValue(e.target.value)}
                className="bg-[#1a1a1a] border border-gray-600 text-white text-sm rounded-lg px-3 py-1.5 w-full focus:border-[#e50914] outline-none"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveTopic()}
              />
            ) : (
              <p className="text-base font-semibold">{comic.series || 'Geral'}</p>
            )}
          </div>
          {isEditingTopic ? (
            <button onClick={handleSaveTopic} className="bg-green-600/80 hover:bg-green-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 mt-4 transition">
              <Check size={13} /> Salvar
            </button>
          ) : (
            <button onClick={() => setIsEditingTopic(true)} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 mt-4 transition">
              <Edit3 size={13} /> Editar
            </button>
          )}
        </div>

        {/* ── NETFLIX-STYLE EDITIONS LIST ── */}
        {siblings.length > 1 && (
          <div className="mt-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-white/8 pb-3">
              <div>
                <h2 className="text-base font-bold">Edições da Coleção</h2>
                <p className="text-xs text-gray-500 mt-0.5">{siblings.length} quadrinhos · em ordem alfabética</p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!prevComic}
                  onClick={() => prevComic && navigate(`/details/${prevComic.id}`)}
                  className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition font-semibold"
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  disabled={!nextComic}
                  onClick={() => nextComic && navigate(`/details/${nextComic.id}`)}
                  className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition font-semibold"
                >
                  Próxima <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* List — Netflix episode style */}
            <div className="flex flex-col gap-2">
              {siblings.map((c, idx) => {
                const isCurrent = c.id === comic.id;
                const p = c.totalPages ? Math.round((c.currentPage / (c.totalPages - 1)) * 100) : 0;
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/details/${c.id}`)}
                    className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 border
                      ${isCurrent
                        ? 'bg-[#e50914]/10 border-[#e50914]/40'
                        : 'bg-[#1a1a1a] border-transparent hover:bg-[#252525] hover:border-white/10'
                      }`}
                  >
                    {/* Number */}
                    <span className={`text-lg font-black w-7 text-center flex-shrink-0 ${isCurrent ? 'text-[#e50914]' : 'text-gray-600'}`}>
                      {idx + 1}
                    </span>

                    {/* Thumbnail */}
                    <div className="relative w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-black">
                      {c.coverImage && (
                        <img src={c.coverImage} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                      )}
                      {p > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                          <div className="h-full bg-[#e50914]" style={{ width: `${p}%` }} />
                        </div>
                      )}
                      {isCurrent && (
                        <div className="absolute inset-0 bg-[#e50914]/30 flex items-center justify-center">
                          <Play size={20} fill="white" className="text-white drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-white' : 'text-gray-200'}`}>{c.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.totalPages} páginas
                        {p > 0 && p < 100 ? ` · ${p}% lido` : ''}
                        {p >= 100 ? ' · ✓ Concluído' : ''}
                      </p>
                    </div>

                    {/* Play button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/read/${c.id}`); }}
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition
                        ${isCurrent ? 'bg-[#e50914] text-white' : 'bg-white/10 hover:bg-white/25 text-white'}`}
                    >
                      <Play size={14} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* File info */}
        <p className="text-xs text-gray-700 font-mono mt-10 break-all">{comic.fileName}</p>
      </div>
    </div>
  );
};
