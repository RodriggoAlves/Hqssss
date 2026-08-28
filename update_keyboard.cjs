const fs = require('fs');

const path = 'src/pages/Reader.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace keyboard navigation effect
const keyboardRegex = /\/\/ Keyboard navigation[\s\S]*?\}, \[next, prev, navigate\]\);/m;
const newKeyboardCode = `  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', ' '].includes(e.key) && e.target === document.body) {
        e.preventDefault(); // Prevent default scroll on body
      }
      
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate('/');
      else if (e.key === 'ArrowUp') {
        if (displayMode === 'webtoon') outerContainerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
        else scrollContainerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
      }
      else if (e.key === 'ArrowDown') {
        if (displayMode === 'webtoon') outerContainerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
        else scrollContainerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, prev, navigate, displayMode]);`;

content = content.replace(keyboardRegex, newKeyboardCode);

// Add refs to the divs
content = content.replace(
  /<div className=\{\`h-screen bg-black flex flex-col select-none \$\{displayMode === 'webtoon' \? 'overflow-y-auto' : 'overflow-hidden'\}\`\}>/,
  `<div ref={outerContainerRef} className={\`h-screen bg-black flex flex-col select-none \${displayMode === 'webtoon' ? 'overflow-y-auto' : 'overflow-hidden'}\`}>`
);

content = content.replace(
  /<div \s*className=\{\`flex-1 \$\{displayMode === 'webtoon' \? 'w-full pt-16 pb-20' : 'flex items-center justify-center'\}\`\}\s*style=\{\{/,
  `<div \n        ref={scrollContainerRef}\n        className={\`flex-1 \${displayMode === 'webtoon' ? 'w-full pt-16 pb-20' : 'flex items-center justify-center'}\`}\n        style={{`
);

fs.writeFileSync(path, content);
console.log('Update complete.');
