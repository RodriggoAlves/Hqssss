import React, { useState, useEffect } from 'react';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ComicCard } from '../components/ComicCard';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:3001';

export const Home: React.FC = () => {
  const [comics, setComics] = useState<Comic[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => { loadComics(); }, []);

  const loadComics = async () => {
    try {
      const data = await fetch(`${API}/api/comics`).then(r => r.json());
      const merged = [];
      for (const c of data) {
        const local = await storage.getComic(c.id);
        merged.push({
          ...c,
          progress: local?.progress ?? 0,
          currentPage: local?.currentPage ?? 0,
          lastRead: local?.lastRead ?? 0,
        });
      }
      merged.sort((a, b) => {
        if (a.lastRead > 0 || b.lastRead > 0) return b.lastRead - a.lastRead;
        return a.title.localeCompare(b.title, undefined, { numeric: true });
      });
      setComics(merged);
    } catch {
      setErrorMsg('Servidor não está rodando. Execute: node server.mjs');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    setErrorMsg(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setImportProgress(`Importando ${i + 1}/${files.length}: ${file.name}`);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API}/api/import`, { method: 'POST', body: form });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erro desconhecido');
        }
      } catch (err: any) {
        setErrorMsg(`Erro em ${file.name}: ${err.message}`);
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
      <header className="flex items-center justify-between px-8 py-4 bg-gradient-to-b from-black/80 to-transparent sticky top-0 z-50">
        <h1 className="text-3xl font-bold text-[#e50914] tracking-wider">COMIC FLIX</h1>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#141414] border border-gray-700 text-white rounded-full py-2 pl-10 pr-4 focus:outline-none focus:border-gray-500 transition w-64"
            />
          </div>
          <label className={`cursor-pointer ${isImporting ? 'opacity-50' : 'bg-white/10 hover:bg-white/20'} transition px-4 py-2 rounded flex items-center gap-2`}>
            <Plus size={20} />
            <span className="font-medium">IMPORTAR</span>
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
      <main className="px-8 mt-4">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
            {errorMsg}
          </div>
        )}

        {isImporting && (
          <div className="mb-6 p-4 bg-[#2f2f2f] rounded animate-pulse text-center text-white">
            {importProgress}
          </div>
        )}

        {comics.length === 0 && !isImporting ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <h2 className="text-2xl font-semibold mb-2">Sua biblioteca está vazia</h2>
            <p className="text-gray-400 mb-6">Importe arquivos .cbz ou .cbr do seu computador</p>
            <label className="cursor-pointer bg-[#e50914] hover:bg-red-700 transition px-6 py-3 rounded text-lg font-bold">
              + IMPORTAR QUADRINHO
              <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={handleImport} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
