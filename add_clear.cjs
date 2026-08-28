const fs = require('fs');

const path = 'src/pages/Home.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add handleClearLibrary function
const handleImportRegex = /const handleImport = async \([^\}]+\{\n(?:[^}]|\}[^$])*?^\s*await loadComics\(\);\n\s*\};/m;

const clearLibraryCode = `
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
`;

content = content.replace(/(const handleImport = async .*?\n(?:.|\n)*?await loadComics\(\);\n  \};\n)/, "$1\n" + clearLibraryCode);

// Add clear button to the header
const headerRegex = /<label className=\{\`flex-1 cursor-pointer \$\{isImporting \? 'opacity-50' : 'bg-\[\#e50914\] hover:bg-red-700'\} text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2\`\}>[\s\S]*?<\/label>/;
const newHeaderBtn = `$&
            <button onClick={handleClearLibrary} className="flex-1 bg-red-900/50 hover:bg-red-800 text-white transition px-4 py-2 rounded font-bold flex items-center justify-center gap-2" title="Limpar Biblioteca">
              Limpar Tudo
            </button>`;

content = content.replace(headerRegex, newHeaderBtn);

fs.writeFileSync(path, content);
console.log('Added Clear button');
