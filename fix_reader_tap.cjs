const fs = require('fs');

// === Fix Reader.tsx ===
let reader = fs.readFileSync('src/pages/Reader.tsx', 'utf8');

// 1. Fix image sizing: use max-height + max-width contain at 100%, overflow only when zoomed
reader = reader.replace(
  /\/\/ Image size style[\s\S]*?const imgStyle: React\.CSSProperties = displayMode === 'webtoon'[\s\S]*?: \{ height: `\$\{zoom\}dvh`, width: 'auto', maxWidth: 'none', flexShrink: 0 \};/m,
  `// Image sizing — at 100% zoom, image fits fully within screen (contain)
  // At zoom > 100%, image grows larger and becomes scrollable
  const imgStyle: React.CSSProperties = displayMode === 'webtoon'
    ? { width: \`\${zoom}%\`, height: 'auto', maxWidth: 'none', flexShrink: 0 }
    : zoom > 100
      ? { height: \`\${zoom}dvh\`, width: 'auto', maxWidth: 'none', flexShrink: 0 }
      : { maxHeight: '100dvh', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' };`
);

// 2. Fix tap toggle - remove mousemove handler (causes issues on mobile) and fix tap logic
reader = reader.replace(
  /\/\/ UI auto-hide[\s\S]*?window\.addEventListener\('mousemove', showUITemporarily\);[\s\S]*?window\.removeEventListener\('mousemove', showUITemporarily\);[\s\S]*?\};\n  \}, \[showUITemporarily\]\);/m,
  `// UI auto-hide — only use mousemove on desktop
  useEffect(() => {
    const isDesktop = window.matchMedia('(hover: hover)').matches;
    if (isDesktop) {
      window.addEventListener('mousemove', showUITemporarily);
      return () => {
        window.removeEventListener('mousemove', showUITemporarily);
        clearTimeout(uiTimerRef.current);
      };
    }
    return () => { clearTimeout(uiTimerRef.current); };
  }, [showUITemporarily]);`
);

// 3. Fix touch handler: when not zoomed and in single/double mode, check horizontal pan need
// Replace the handleTouchEnd to detect tap vs swipe correctly and enable horizontal pan at 100% if image is wider than screen
reader = reader.replace(
  /const handleTouchEnd = \(e: React\.TouchEvent\) => \{[\s\S]*?\};(\s*\/\/ ──)/m,
  `const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // When zoomed or webtoon, let native scroll/pan handle it
    if (zoom > 100 || displayMode === 'webtoon') {
      // Tap only (barely moved)
      if (absDx < 10 && absDy < 10 && dt < 300) {
        setShowUI(s => !s);
        clearTimeout(uiTimerRef.current);
      }
      return;
    }

    // Horizontal swipe to change page
    if (absDx > 40 && absDx > absDy * 1.3 && dt < 400 && displayMode !== 'webtoon') {
      if (dx < 0) next();
      else prev();
      return;
    }

    // Tap — toggle UI
    if (absDx < 12 && absDy < 12 && dt < 300) {
      setShowUI(s => !s);
      clearTimeout(uiTimerRef.current);
    }
  };$1`
);

// 4. Fix container: at 100% zoom allow overflow-x auto in case image is slightly wider
reader = reader.replace(
  /overflowX: isZoomed \? 'auto' : 'hidden',/,
  `overflowX: (isZoomed || zoom === 100) ? 'auto' : 'hidden',`
);

// 5. Fix touchAction to allow panning even at 100% zoom (just no swipe, let scroll happen)
reader = reader.replace(
  /touchAction: isZoomed \|\| displayMode === 'webtoon' \? 'pan-x pan-y' : 'none',/,
  `touchAction: displayMode === 'webtoon' ? 'pan-y' : isZoomed ? 'pan-x pan-y' : 'none',`
);

fs.writeFileSync('src/pages/Reader.tsx', reader);

// === Remove bottom nav from Home.tsx (now global in App.tsx) ===
let home = fs.readFileSync('src/pages/Home.tsx', 'utf8');
// Remove the mobile bottom bar section from Home since it's now global
home = home.replace(
  /\s*\{\/\* ── MOBILE BOTTOM BAR ──[\s\S]*?<\/div>\s*\n\s*\{\/\* ── MOBILE BOTTOM BAR ── \*\/\}/,
  ''
);
// Also remove the inline bottom bar block
const mobileBarStart = home.indexOf('      {/* ── MOBILE BOTTOM BAR ── */}');
const mobileBarEnd = home.indexOf('</div>\n      </div>\n\n      <style>');
if (mobileBarStart !== -1 && mobileBarEnd !== -1) {
  home = home.slice(0, mobileBarStart) + home.slice(mobileBarEnd + '</div>'.length);
}
fs.writeFileSync('src/pages/Home.tsx', home);

// === Update App.tsx ===
const appContent = `import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Reader } from './pages/Reader';
import { Details } from './pages/Details';
import { Library, Plus, FolderPlus, Trash2 } from 'lucide-react';
import { storage } from './services/StorageService';

// ── Global Bottom Nav (hidden in Reader) ──
const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname.startsWith('/read/')) return null;

  const handleImportFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cbz,.zip,.cbr,.rar';
    input.multiple = true;
    input.onchange = () => {
      window.dispatchEvent(new CustomEvent('import-files', { detail: { files: input.files } }));
      if (location.pathname !== '/') navigate('/');
    };
    input.click();
  };

  const handleImportFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.onchange = () => {
      window.dispatchEvent(new CustomEvent('import-folder', { detail: { files: input.files } }));
      if (location.pathname !== '/') navigate('/');
    };
    input.click();
  };

  const handleClear = async () => {
    if (!window.confirm('Apagar TODOS os quadrinhos da biblioteca?')) return;
    const all = await storage.getAllComics();
    for (const c of all) await storage.deleteComic(c.id);
    window.dispatchEvent(new CustomEvent('library-cleared'));
    if (location.pathname !== '/') navigate('/');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-6 py-2.5 bg-black/95 backdrop-blur-md border-t border-white/8 md:hidden">
      <button
        onClick={() => navigate('/')}
        className={\`flex flex-col items-center gap-1 transition-colors \${location.pathname === '/' ? 'text-[#e50914]' : 'text-gray-500 hover:text-white'}\`}
      >
        <Library size={22} />
        <span className="text-[10px] font-medium">Biblioteca</span>
      </button>

      <button onClick={handleImportFiles} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white transition-colors">
        <Plus size={22} />
        <span className="text-[10px] font-medium">Arquivos</span>
      </button>

      <button onClick={handleImportFolder} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white transition-colors">
        <FolderPlus size={22} />
        <span className="text-[10px] font-medium">Pasta</span>
      </button>

      <button onClick={handleClear} className="flex flex-col items-center gap-1 text-gray-600 hover:text-red-500 transition-colors">
        <Trash2 size={22} />
        <span className="text-[10px] font-medium">Limpar</span>
      </button>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read/:id" element={<Reader />} />
        <Route path="/details/:id" element={<Details />} />
      </Routes>
      <BottomNav />
    </Router>
  );
}

export default App;
`;

fs.writeFileSync('src/App.tsx', appContent);
console.log('All updates applied.');
