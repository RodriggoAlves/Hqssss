import React, { useState, useEffect } from 'react';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ComicCard } from '../components/ComicCard';
import { Plus, Search, Download, FolderPlus, ChevronRight, ChevronDown, Library } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ComicParser } from '../services/ComicParser';

export const Home: React.FC = () => {
  const [comics, setComics] = useState<Comic[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importTotal, setImportTotal] = useState(0);
  const [importCurrent, setImportCurrent] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'az' | 'za'>('recent');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => { loadComics(); }, []);

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const loadComics = async () => {
    try {
      const allComics = await storage.getAllComics();
      setComics(allComics);
    } catch (err: any) {
      setErrorMsg(`Erro ao carregar: ${err.message}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, isFolder = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(f =>
      /\.(cbz|cbr|zip|rar)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      setErrorMsg('Nenhum arquivo válido (.cbz, .cbr, .zip, .rar)');
      return;
    }

    setIsImporting(true);
    setImportTotal(validFiles.length);
    setErrorMsg(null);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setImportCurrent(i + 1);
      setImportProgress(file.name);

      try {
        let topic = '';
        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 2) {
            topic = parts.slice(1, -1).join('/');
          } else if (parts.length === 2) {
            topic = parts[0];
          }
        }

        const id = crypto.randomUUID();
        const parser = new ComicParser(file, file.name);
        await parser.load();

        const coverUrl = await parser.getCoverUrl();
        const res = await fetch(coverUrl);
        const coverBlob = await res.blob();
        const coverBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(coverBlob);
        });

        const comic: Comic = {
          id,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          series: topic || 'Geral',
          format: /\.(cbr|rar)$/i.test(file.name) ? 'cbr' : 'cbz',
          totalPages: parser.getTotalPages(),
          fileSize: file.size,
          progress: 0,
          currentPage: 0,
          lastRead: Date.now(),
          coverImage: coverBase64
        };

        await storage.saveComic(comic);
        await storage.saveComicFile(id, file);
      } catch (err: any) {
        console.error(`Erro em ${file.name}:`, err);
      }
    }

    setIsImporting(false);
    setImportProgress('');
    setImportTotal(0);
    setImportCurrent(0);
    e.target.value = '';
    await loadComics();
  };

  const handleClearLibrary = async () => {
    if (!window.confirm('Apagar TODOS os quadrinhos da biblioteca?')) return;
    const all = await storage.getAllComics();
    for (const c of all) await storage.deleteComic(c.id);
    await loadComics();
  };

  const toggleRoot = (root: string) =>
    setExpandedRoots(prev => ({ ...prev, [root]: !prev[root] }));

  const filteredComics = comics
    .filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'az') return a.title.localeCompare(b.title);
      if (sortOrder === 'za') return b.title.localeCompare(a.title);
      return (b.lastRead || 0) - (a.lastRead || 0);
    });

  const tree = filteredComics.reduce((acc, comic) => {
    const fullPath = comic.series || 'Geral';
    const parts = fullPath.split('/');
    const root = parts[0];
    const sub = parts.length > 1 ? parts.slice(1).join('/') : '__root__';
    if (!acc[root]) acc[root] = { totalComics: [], subs: {} };
    acc[root].totalComics.push(comic);
    if (!acc[root].subs[sub]) acc[root].subs[sub] = [];
    acc[root].subs[sub].push(comic);
    return acc;
  }, {} as Record<string, { totalComics: Comic[], subs: Record<string, Comic[]> }>);

  const sortedRoots = Object.keys(tree).sort((a, b) => {
    if (a === 'Geral') return 1;
    if (b === 'Geral') return -1;
    return a.localeCompare(b);
  });

  const featuredComic = comics.find(c => (c.progress ?? 0) > 0 && (c.progress ?? 0) < 100) || comics[0];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {/* ── NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 bg-black/70 backdrop-blur-md border-b border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Library size={22} className="text-[#e50914]" />
          <span className="text-lg font-extrabold text-[#e50914] tracking-wider hidden sm:block">COMIC FLIX</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs mx-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/8 border border-white/10 text-white rounded-full py-1.5 pl-8 pr-3 text-sm placeholder-gray-500 focus:outline-none focus:border-[#e50914]/50 focus:bg-white/10 transition"
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-white/8 border border-white/10 text-gray-300 rounded-full py-1.5 px-3 text-xs focus:outline-none hidden sm:block"
          >
            <option value="recent">Recentes</option>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
          </select>

          <label className="cursor-pointer bg-white/10 hover:bg-white/20 transition px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
            <Plus size={13} /> Arquivos
            <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={(e) => handleImport(e, false)} disabled={isImporting} />
          </label>

          <label className="cursor-pointer bg-[#e50914] hover:bg-red-700 transition px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
            <FolderPlus size={13} /> Pasta
            {/* @ts-ignore */}
            <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => handleImport(e, true)} disabled={isImporting} />
          </label>

          {deferredPrompt && (
            <button onClick={handleInstallClick} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
              <Download size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ── HERO (last read / featured) ── */}
      {featuredComic && !searchQuery && (
        <div
          className="relative w-full pt-16"
          style={{ height: 'min(55vh, 440px)' }}
        >
          {/* Blurred bg */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${featuredComic.coverImage})`, filter: 'blur(28px) brightness(0.35)', transform: 'scale(1.05)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/30 to-transparent" />

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-end px-5 md:px-12 pb-8">
            <div className="flex items-end gap-4">
              {/* Cover */}
              <img
                src={featuredComic.coverImage}
                alt={featuredComic.title}
                className="w-20 md:w-40 rounded-xl shadow-2xl flex-shrink-0 ring-1 ring-white/10"
              />
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-xs text-[#e50914] font-bold uppercase tracking-widest mb-1">
                  {featuredComic.progress && featuredComic.progress > 0 ? '▶ Em leitura' : 'Sua biblioteca'}
                </p>
                <h2 className="text-xl md:text-4xl font-black leading-tight drop-shadow-lg mb-3 line-clamp-2">
                  {featuredComic.title}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/read/${featuredComic.id}`)}
                    className="flex items-center gap-1.5 bg-white text-black px-4 py-2 rounded-full text-xs md:text-sm font-bold hover:bg-gray-200 transition"
                  >
                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    {featuredComic.progress && featuredComic.progress > 0 ? 'Continuar' : 'Ler Agora'}
                  </button>
                  <button
                    onClick={() => navigate(`/details/${featuredComic.id}`)}
                    className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition"
                  >
                    + Detalhes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT PROGRESS BAR ── */}
      {isImporting && (
        <div className="px-6 py-3 bg-[#1a1a1a] border-b border-white/5">
          <div className="flex items-center justify-between mb-1.5 text-xs text-gray-400">
            <span>Importando {importCurrent}/{importTotal}: <span className="text-white font-medium truncate max-w-xs inline-block align-middle">{importProgress}</span></span>
            <span>{Math.round((importCurrent / importTotal) * 100)}%</span>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-[#e50914] transition-all duration-300 rounded-full" style={{ width: `${(importCurrent / importTotal) * 100}%` }} />
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {errorMsg && (
        <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-900/40 border border-red-500/40 rounded-lg text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      {/* ── LIBRARY ── */}
      <main className={`px-4 md:px-8 pb-24 md:pb-12 ${featuredComic && !searchQuery ? 'mt-4' : 'mt-20'}`}>
        {comics.length === 0 && !isImporting ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center gap-4">
            <Library size={48} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-400">Biblioteca vazia</h2>
            <p className="text-gray-600 text-sm">Importe arquivos .cbz ou .cbr para começar</p>
            <label className="cursor-pointer bg-[#e50914] hover:bg-red-700 transition px-6 py-2.5 rounded-full text-sm font-bold mt-2">
              + Importar HQs
              <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={(e) => handleImport(e, false)} />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {sortedRoots.map(root => {
              const isExpanded = expandedRoots[root];
              const rootData = tree[root];
              const hasSubs = Object.keys(rootData.subs).some(s => s !== '__root__');

              return (
                <div key={root}>
                  {/* Section header */}
                  <div
                    className="flex items-center justify-between mb-3 cursor-pointer group"
                    onClick={() => hasSubs && toggleRoot(root)}
                  >
                    <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 group-hover:text-[#e50914] transition-colors">
                      {root}
                      {hasSubs && (
                        isExpanded
                          ? <ChevronDown size={18} className="text-gray-400" />
                          : <ChevronRight size={18} className="text-gray-400" />
                      )}
                    </h2>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/?filter=${encodeURIComponent(root)}`); }}
                      className="text-xs text-gray-500 hover:text-white transition"
                    >
                      {rootData.totalComics.length} quadrinhos
                    </button>
                  </div>

                  {!isExpanded || !hasSubs ? (
                    /* Collapsed: horizontal scroll of all comics */
                    <div
                      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {rootData.totalComics.map(comic => (
                        <div key={comic.id} className="snap-start flex-shrink-0 w-[130px] md:w-[160px]">
                          <ComicCard comic={comic} onClick={(c) => navigate(`/details/${c.id}`)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Expanded: subfolders */
                    <div className="flex flex-col gap-6 pl-3 border-l border-[#e50914]/20">
                      {Object.keys(rootData.subs).sort().map(sub => (
                        <div key={sub}>
                          {sub !== '__root__' && (
                            <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#e50914]" />
                              {sub}
                            </h3>
                          )}
                          <div
                            className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                          >
                            {rootData.subs[sub].map(comic => (
                              <div key={comic.id} className="snap-start flex-shrink-0 w-[130px] md:w-[160px]">
                                <ComicCard comic={comic} onClick={(c) => navigate(`/details/${c.id}`)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── MOBILE BOTTOM BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-4 py-3 bg-black/80 backdrop-blur border-t border-white/5 md:hidden">
        <button className="flex flex-col items-center gap-1 text-[#e50914]">
          <Library size={20} />
          <span className="text-[10px] font-medium">Biblioteca</span>
        </button>

        <label className="flex flex-col items-center gap-1 text-gray-400 cursor-pointer">
          <Plus size={20} />
          <span className="text-[10px] font-medium">Importar</span>
          <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={(e) => handleImport(e, false)} disabled={isImporting} />
        </label>

        <label className="flex flex-col items-center gap-1 text-gray-400 cursor-pointer">
          <FolderPlus size={20} />
          <span className="text-[10px] font-medium">Pasta</span>
          {/* @ts-ignore */}
          <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => handleImport(e, true)} disabled={isImporting} />
        </label>

        <button onClick={handleClearLibrary} className="flex flex-col items-center gap-1 text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          <span className="text-[10px] font-medium">Limpar</span>
        </button>
      </div>

      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};
