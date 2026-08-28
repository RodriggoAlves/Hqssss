import React, { useState, useEffect } from 'react';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ComicCard } from '../components/ComicCard';
import { Plus, Search, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ComicParser } from '../services/ComicParser';

export const Home: React.FC = () => {
  const [comics, setComics] = useState<Comic[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    setErrorMsg(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setImportProgress(`Processando ${i + 1}/${files.length}: ${file.name}`);
      try {
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
        setErrorMsg(`Erro ao importar ${file.name}: ${err.message}`);
      }
    }

    setIsImporting(false);
    setImportProgress('');
    e.target.value = '';
    await loadComics();
  };

  const filteredComics = comics.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen pb-12">
      {/* Navbar */}
      <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-4 bg-gradient-to-b from-black/80 to-transparent sticky top-0 z-50 gap-4 md:gap-0">
        <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-start">
          <img src="/pwa-192x192.png" alt="Comic Flix Logo" className="w-10 h-10 rounded-xl shadow-lg" />
          <h1 className="text-2xl md:text-3xl font-bold text-[#e50914] tracking-wider">COMIC FLIX</h1>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="bg-white/10 hover:bg-white/20 transition px-4 py-2 rounded flex items-center justify-center gap-2 w-full md:w-auto font-medium text-sm md:text-base border border-gray-600"
            >
              <Download size={20} />
              INSTALAR APP
            </button>
          )}

          <div className="relative w-full md:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#141414] border border-gray-700 text-white rounded-full py-2 pl-10 pr-4 focus:outline-none focus:border-gray-500 transition w-full md:w-64"
            />
          </div>
          <label className={`cursor-pointer ${isImporting ? 'opacity-50' : 'bg-white/10 hover:bg-white/20'} transition px-4 py-2 rounded flex items-center justify-center gap-2 w-full md:w-auto`}>
            <Plus size={20} />
            <span className="font-medium text-sm md:text-base">IMPORTAR</span>
            <input
              type="file"
              accept=".cbz,.zip,.cbr,.rar"
              multiple
              className="hidden"
              onChange={handleImport}
              disabled={isImporting}
            />
          </label>
        </div>
      </header>

      {/* Main */}
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
            <p className="text-gray-400 mb-6 text-sm md:text-base">Importe arquivos .cbz ou .cbr para ler offline</p>
            <label className="cursor-pointer bg-[#e50914] hover:bg-red-700 transition px-6 py-3 rounded text-base md:text-lg font-bold">
              + IMPORTAR QUADRINHO
              <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={handleImport} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {filteredComics.map(comic => (
              <ComicCard
                key={comic.id}
                comic={comic}
                onClick={(c) => navigate(`/details/${c.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
