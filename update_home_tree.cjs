const fs = require('fs');

const path = 'src/pages/Home.tsx';
let content = fs.readFileSync(path, 'utf8');

const importRegex = /let topic = '';\s*if \(isFolder && file\.webkitRelativePath\) \{[\s\S]*?\}\s*const id = crypto\.randomUUID\(\);/m;
const newImportLogic = `let topic = '';
        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 2) {
            // Ignora a pasta raiz selecionada (parts[0]) e o nome do arquivo (parts[parts.length - 1])
            topic = parts.slice(1, -1).join('/');
          } else if (parts.length === 2) {
            topic = parts[0];
          }
        }

        const id = crypto.randomUUID();`;

content = content.replace(importRegex, newImportLogic);

// Add state for expanded folders
const stateRegex = /const \[errorMsg, setErrorMsg\] = useState<string \| null>\(null\);\n  const navigate = useNavigate\(\);/m;
const newState = `const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  
  const toggleRoot = (root: string) => {
    setExpandedRoots(prev => ({ ...prev, [root]: !prev[root] }));
  };`;
content = content.replace(stateRegex, newState);

// Add ChevronDown to imports
content = content.replace('ChevronRight', 'ChevronRight, ChevronDown');

// Update grouping logic
const groupRegex = /\/\/ Group by topic\/series[\s\S]*?\}\);/m;
const newGroupLogic = `// Group by tree structure (Root -> Subfolders)
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
  });`;
content = content.replace(groupRegex, newGroupLogic);

// Update render logic
const renderRegex = /<div className="flex flex-col gap-10 mt-6">[\s\S]*?<\/div>\n        \)}/m;
const newRenderLogic = `<div className="flex flex-col gap-10 mt-6">
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
                          <ComicCard comic={comic} onClick={(c) => navigate(\`/details/\${c.id}\`)} />
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
                                <ComicCard comic={comic} onClick={(c) => navigate(\`/details/\${c.id}\`)} />
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
        )}`;
content = content.replace(renderRegex, newRenderLogic);

fs.writeFileSync(path, content);
console.log('Update Home Tree complete.');
