const fs = require('fs');

let home = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// We need to change `handleImport` to `processImport` and then hook up event listeners.

// 1. Rename `handleImport` to `processImport` and change its signature:
home = home.replace(
  /const handleImport = async \(e: React\.ChangeEvent<HTMLInputElement>, isFolder = false\) => \{[\s\S]*?const files = e\.target\.files;\n\s*if \(!files \|\| files\.length === 0\) return;/m,
  `const processImport = async (files: FileList | File[], isFolder = false) => {
    if (!files || files.length === 0) return;`
);

// 2. Change `e.target.value = '';` to `// no-op`
home = home.replace(
  /e\.target\.value = '';/g,
  `// e.target.value reset omitted`
);

// 3. Create a new `handleImport` that calls `processImport`
home = home.replace(
  /const handleClearLibrary/m,
  `const handleImport = (e: React.ChangeEvent<HTMLInputElement>, isFolder = false) => {
    if (e.target.files) processImport(e.target.files, isFolder);
    e.target.value = '';
  };

  const handleClearLibrary`
);

// 4. Add the event listeners inside an effect (preferably after `loadComics`)
const eventListenersCode = `
  useEffect(() => {
    const onClear = () => loadComics();
    const onImportFiles = (e: any) => e.detail?.files && processImport(e.detail.files, false);
    const onImportFolder = (e: any) => e.detail?.files && processImport(e.detail.files, true);

    window.addEventListener('library-cleared', onClear);
    window.addEventListener('import-files', onImportFiles);
    window.addEventListener('import-folder', onImportFolder);

    return () => {
      window.removeEventListener('library-cleared', onClear);
      window.removeEventListener('import-files', onImportFiles);
      window.removeEventListener('import-folder', onImportFolder);
    };
  }, []);
`;

home = home.replace(
  /useEffect\(\(\) => \{ loadComics\(\); \}, \[\]\);/m,
  `useEffect(() => { loadComics(); }, []);\n${eventListenersCode}`
);

fs.writeFileSync('src/pages/Home.tsx', home);
console.log('Fixed Home.tsx listeners');
