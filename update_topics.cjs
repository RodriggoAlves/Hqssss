const fs = require('fs');

const homeTsx = `import React, { useState, useEffect } from 'react';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ComicCard } from '../components/ComicCard';
import { Plus, Search, Download, FolderPlus, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ComicParser } from '../services/ComicParser';

export const Home: React.FC = () => {
  const [comics, setComics] = useState<Comic[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'az' | 'za'>('recent');
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
      setErrorMsg(\`Erro ao carregar HQs locais: \${err.message}\`);
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
      setImportProgress(\`Importando \${i + 1}/\${validFiles.length}: \${file.name}\`);
      
      try {
        let topic = '';
        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 1) {
            topic = parts[0]; // Top level folder name becomes the topic
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
          title: file.name.replace(/\\.[^/.]+$/, ''),
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
        console.error(\`Erro em \${file.name}:\`, err);
        // Continue to next file even if one fails
      }
    }

    setIsImporting(false);
    setImportProgress('');
    e.target.value = '';
    await loadComics();
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

  // Group by topic/series
  const groupedComics = filteredComics.reduce((acc, comic) => {
    const topic = comic.series || 'Geral';
    if (!acc[topic]) acc[topic] = [];
    acc[topic].push(comic);
    return acc;
  }, {} as Record<string, Comic[]>);

  // Sort topics alphabetically, but keep 'Geral' at the end or top
  const sortedTopics = Object.keys(groupedComics).sort((a, b) => {
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
            <label className={\`flex-1 cursor-pointer \${isImporting ? 'opacity-50' : 'bg-[#2f2f2f] hover:bg-gray-700'} text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2\`}>
              <Plus size={20} />
              <span className="text-sm md:text-base">ARQUIVOS</span>
              <input type="file" accept=".cbz,.zip,.cbr,.rar" multiple className="hidden" onChange={(e) => handleImport(e, false)} disabled={isImporting} />
            </label>

            <label className={\`flex-1 cursor-pointer \${isImporting ? 'opacity-50' : 'bg-[#e50914] hover:bg-red-700'} text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2\`}>
              <FolderPlus size={20} />
              <span className="text-sm md:text-base">PASTA</span>
              {/* @ts-ignore - webkitdirectory is non-standard but works */}
              <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => handleImport(e, true)} disabled={isImporting} />
            </label>
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
            {sortedTopics.map(topic => (
              <div key={topic} className="flex flex-col">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    {topic} <ChevronRight size={20} className="text-gray-500" />
                  </h2>
                  <span className="text-gray-400 text-sm">{groupedComics[topic].length} quadrinhos</span>
                </div>
                
                {/* Netflix-style horizontal scroll */}
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {groupedComics[topic].map(comic => (
                    <div key={comic.id} className="min-w-[140px] w-[140px] md:min-w-[180px] md:w-[180px] snap-start flex-shrink-0">
                      <ComicCard
                        comic={comic}
                        onClick={(c) => navigate(\`/details/\${c.id}\`)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <style>{'\\n.hide-scrollbar::-webkit-scrollbar { display: none; }\\n'}</style>
    </div>
  );
};
`;

const detailsTsx = `import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Comic } from '../types';
import { storage } from '../services/StorageService';
import { ArrowLeft, Play, Trash2, Info, Edit3, Check } from 'lucide-react';

export const Details: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [comic, setComic] = useState<Comic | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [editTopicValue, setEditTopicValue] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const c = await storage.getComic(id);
        if (c) {
          setComic(c);
          setEditTopicValue(c.series || 'Geral');
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
    return <div className="min-h-screen pt-20 px-8 text-center text-xl text-white">Carregando detalhes...</div>;
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const progressPercent = comic.totalPages ? Math.round((comic.currentPage / (comic.totalPages - 1)) * 100) : 0;

  return (
    <div className="min-h-screen relative text-white">
      {/* Background with blur */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: \`url(\${comic.coverImage})\`, filter: 'blur(40px)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/90 to-[#141414]/60" />

      <div className="relative z-10 pt-20 px-6 md:px-12 max-w-6xl mx-auto">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition mb-8"
        >
          <ArrowLeft size={24} />
          <span className="font-semibold text-lg">Voltar</span>
        </button>

        <div className="flex flex-col md:flex-row gap-10">
          {/* Cover */}
          <div className="w-full md:w-1/3 max-w-sm flex-shrink-0 mx-auto md:mx-0">
            <img 
              src={comic.coverImage} 
              alt={comic.title}
              className="w-full rounded-lg shadow-2xl shadow-black/80"
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-4">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">{comic.title}</h1>
            
            <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm md:text-base font-medium mb-6">
              <span className="bg-white/10 px-2 py-1 rounded uppercase">{comic.format}</span>
              <span>•</span>
              <span>{comic.totalPages} páginas</span>
              <span>•</span>
              <span>{formatSize(comic.fileSize)}</span>
            </div>

            {/* Topic/Series Editor */}
            <div className="mb-8 p-4 bg-white/5 rounded-lg border border-white/10 flex flex-col md:flex-row md:items-center gap-4 max-w-md">
              <div className="flex-1">
                <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Tópico / Coleção</span>
                {isEditingTopic ? (
                  <input 
                    type="text" 
                    value={editTopicValue} 
                    onChange={e => setEditTopicValue(e.target.value)}
                    className="w-full bg-[#141414] border border-gray-600 rounded px-3 py-1.5 text-white focus:border-red-500 outline-none"
                    placeholder="Nome do Tópico..."
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveTopic()}
                  />
                ) : (
                  <span className="text-xl font-semibold">{comic.series || 'Geral'}</span>
                )}
              </div>
              <div>
                {isEditingTopic ? (
                  <button onClick={handleSaveTopic} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition w-full md:w-auto justify-center">
                    <Check size={16} /> Salvar
                  </button>
                ) : (
                  <button onClick={() => setIsEditingTopic(true)} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition w-full md:w-auto justify-center">
                    <Edit3 size={16} /> Editar
                  </button>
                )}
              </div>
            </div>

            {/* Read Button */}
            <div className="flex flex-wrap gap-4 mb-10">
              <button 
                onClick={() => navigate(\`/read/\${comic.id}\`)}
                className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded text-lg md:text-xl font-bold hover:bg-gray-200 transition"
              >
                <Play size={28} fill="currentColor" />
                {progressPercent > 0 && progressPercent < 100 ? 'CONTINUAR LENDO' : 'LER AGORA'}
              </button>
              
              <button 
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 bg-red-600/80 text-white px-6 py-3 rounded text-base md:text-lg font-semibold hover:bg-red-600 transition"
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
                    className="h-full bg-[#e50914] transition-all duration-500"
                    style={{ width: \`\${progressPercent}%\` }}
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
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Arquivo Original</h3>
              <p className="text-gray-500 text-sm font-mono break-all">{comic.fileName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
`;

fs.writeFileSync('src/pages/Home.tsx', homeTsx);
fs.writeFileSync('src/pages/Details.tsx', detailsTsx);
console.log('Update topics complete.');
