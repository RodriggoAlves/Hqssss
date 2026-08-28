import React, { useState, useEffect } from 'react';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ComicCard } from '../components/ComicCard';
import { Plus, Search, Download, FolderPlus, ChevronRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ComicParser } from '../services/ComicParser';

export const Home: React.FC = () => {
  const [comics, setComics] = useState<Comic[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'az' | 'za'>('recent');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  
  const toggleRoot = (root: string) => {
    setExpandedRoots(prev => ({ ...prev, [root]: !prev[root] }));
  };

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => { loadComics(); }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const loadComics = async () => {
    try {
      const allComics = await storage.getAllComics();
      setComics(allComics);
    } catch (err: any) {
      setErrorMsg(`Erro ao carregar HQs locais: ${err.message}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, isFolder = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    setErrorMsg(null);

    // Filter valid files
    const validFiles = Array.from(files).filter(f => 
      f.name.toLowerCase().endsWith('.cbz') || 
      f.name.toLowerCase().endsWith('.cbr') || 
      f.name.toLowerCase().endsWith('.zip') || 
      f.name.toLowerCase().endsWith('.rar')
    );

    if (validFiles.length === 0) {
      setErrorMsg('Nenhum arquivo de quadrinho válido encontrado (.cbz, .cbr, .zip, .rar)');
      setIsImporting(false);
      return;
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setImportProgress(`Importando ${i + 1}/${validFiles.length}: ${file.name}`);
      
      try {
        let topic = '';
        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 2) {
            // Ignora a pasta raiz selecionada (parts[0]) e o nome do arquivo (parts[parts.length - 1])
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
          series: topic || 'Geral', // Set topic
          format: (file.name.toLowerCase().endsWith('.cbr') || file.name.toLowerCase().endsWith('.rar')) ? 'cbr' : 'cbz',
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
        // Continue to next file even if one fails
      }
    }

    setIsImporting(false);
    setImportProgress('');
    e.target.value = '';
    await loadComics();
  };


  const handleClearLibrary = async () => {
    if (window.confirm('Tem certeza que deseja apagar TODOS os quadrinhos da biblioteca? Essa ação não pode ser desfeita.')) {
      try {
        const allComics = await storage.getAllComics();
        for (const c of allComics) {
          await storage.deleteComic(c.id);
        }
        await loadComics();
      } catch (err) {
        alert('Erro ao limpar a biblioteca');
      }
    }
  };

  const filteredComics = comics
    .filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'recent') {
        return (b.lastRead || 0) - (a.lastRead || 0);
      } else if (sortOrder === 'az') {
        return a.title.localeCompare(b.title);
      } else {
        return b.title.localeCompare(a.title);
      }
    });

  // Group by tree structure (Root -> Subfolders)
  const tree = filteredComics.reduce((acc, comic) => {
    const fullPath = comic.series || 'Geral';
    const parts = fullPath.split('/');
    const root = parts[0];
    const sub = parts.length > 1 ? parts.slice(1).join('/') : 'Geral';

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

  return (
    <div className="min-h-screen pb-12">
      <header className="flex flex-col lg:flex-row items-center justify-between px-4 md:px-8 py-4 bg-gradient-to-b from-black/80 to-transparent sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3 w-full lg:w-auto justify-center lg:justify-start">
          <img src="/pwa-192x192.png" alt="Comic Flix Logo" className="w-10 h-10 rounded-xl shadow-lg" />
          <h1 className="text-2xl md:text-3xl font-bold text-[#e50914] tracking-wider">COMIC FLIX</h1>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="bg-white/10 hover:bg-white/20 transition px-4 py-2 rounded flex items-center justify-center gap-2 w-full md:w-auto font-medium text-sm md:text-base border border-gray-600"
            >
              <Download size={20} />
              INSTALAR APP
            </button>
          )}

          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar HQs ou Tópicos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#141414] border border-gray-700 text-white rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-gray-500 transition w-full"
              />
            </div>
            
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="bg-[#141414] border border-gray-700 text-white rounded-lg py-2 px-3 focus:outline-none focus:border-gray-500 w-full sm:w-auto"
            >
              <option value="recent">Mais Recentes</option>
              <option value="az">A - Z</option>
              <option value="za">Z - A</option>
            </select>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <label className={`flex-1 cursor-pointer ${isImporting ? 'opacity-50' : 'bg-[#2f2f2f] hover:bg-gray-700'} text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2`}>
              <Plus size={20} />
              <span className="text-sm md:text-base">ARQUIVOS</span>
              <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={(e) => handleImport(e, false)} disabled={isImporting} />
            </label>

            <label className={`flex-1 cursor-pointer ${isImporting ? 'opacity-50' : 'bg-[#e50914] hover:bg-red-700'} text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2`}>
              <FolderPlus size={20} />
              <span className="text-sm md:text-base">PASTA</span>
              {/* @ts-ignore - webkitdirectory is non-standard but works */}
              <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => handleImport(e, true)} disabled={isImporting} />
            </label>
            <button onClick={handleClearLibrary} className="flex-1 bg-red-900/50 hover:bg-red-800 text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2" title="Limpar Biblioteca">
              Limpar Tudo
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 md:px-8 mt-4">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
            {errorMsg}
          </div>
        )}

        {isImporting && (
          <div className="mb-6 p-4 bg-[#2f2f2f] rounded animate-pulse text-center text-white text-sm">
            {importProgress}
          </div>
        )}

        {comics.length === 0 && !isImporting ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
            <h2 className="text-xl md:text-2xl font-semibold mb-2">Sua biblioteca está vazia</h2>
            <p className="text-gray-400 mb-6 text-sm md:text-base">Importe arquivos soltos ou pastas inteiras com suas HQs!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10 mt-6">
            {sortedRoots.map(root => {
              const isExpanded = expandedRoots[root];
              const rootData = tree[root];
              
              return (
                <div key={root} className="flex flex-col bg-[#1a1a1a]/50 rounded-xl p-4 border border-gray-800/50">
                  <div 
                    className="flex items-center justify-between mb-4 px-2 cursor-pointer hover:text-red-500 transition group"
                    onClick={() => toggleRoot(root)}
                  >
                    <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3 group-hover:text-[#e50914] transition">
                      {root} {isExpanded ? <ChevronDown size={28} /> : <ChevronRight size={28} />}
                    </h2>
                    <span className="text-gray-400 font-medium bg-black/50 px-3 py-1 rounded-full text-sm">
                      {rootData.totalComics.length} quadrinhos
                    </span>
                  </div>
                  
                  {!isExpanded ? (
                    // Default collapsed view: Show horizontal list of all comics in this root
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      {rootData.totalComics.map(comic => (
                        <div key={comic.id} className="min-w-[140px] w-[140px] md:min-w-[180px] md:w-[180px] snap-start flex-shrink-0">
                          <ComicCard comic={comic} onClick={(c) => navigate(`/details/${c.id}`)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Expanded view: Show subfolders
                    <div className="flex flex-col gap-8 mt-4 pl-2 md:pl-6 border-l-2 border-[#e50914]/30 ml-2">
                      {Object.keys(rootData.subs).sort().map(sub => (
                        <div key={sub} className="flex flex-col">
                          {sub !== 'Geral' && (
                            <h3 className="text-lg md:text-xl font-bold text-gray-300 mb-3 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-600"></span>
                              {sub}
                            </h3>
                          )}
                          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {rootData.subs[sub].map(comic => (
                              <div key={comic.id} className="min-w-[140px] w-[140px] md:min-w-[180px] md:w-[180px] snap-start flex-shrink-0">
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
      <style>{'\n.hide-scrollbar::-webkit-scrollbar { display: none; }\n'}</style>
    </div>
  );
};
