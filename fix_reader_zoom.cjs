const fs = require('fs');

const path = 'src/pages/Reader.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix the keyboard logic to use scrollTop
const keyboardRegex = /const onKeyDown = \(e: KeyboardEvent\) => \{[\s\S]*?window\.addEventListener\('keydown', onKeyDown\);/m;
const newKeyboardLogic = `const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', ' '].includes(e.key) && e.target === document.body) {
        e.preventDefault(); // Prevent default scroll on body
      }
      
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate('/');
      else if (e.key === 'ArrowUp') {
        if (displayMode === 'webtoon' && outerContainerRef.current) {
          outerContainerRef.current.scrollTop -= 150;
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop -= 150;
        }
      }
      else if (e.key === 'ArrowDown') {
        if (displayMode === 'webtoon' && outerContainerRef.current) {
          outerContainerRef.current.scrollTop += 150;
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += 150;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);`;

content = content.replace(keyboardRegex, newKeyboardLogic);

// 2. Fix the layout and zoom logic
// Remove transform: scale and apply physical dimensions
const imageAreaRegex = /\{\/\* Image area \*\/\}[\s\S]*?\{\/\* Click zones \*\/\}/m;

const newImageArea = `{/* Image area */}
      <div 
        ref={scrollContainerRef}
        className={\`flex-1 \${displayMode === 'webtoon' ? 'w-full pt-16 pb-20' : \`flex justify-center \${zoom > 100 ? 'items-start' : 'items-center'}\`}\`}
        style={{
          overflow: zoom > 100 ? 'auto' : 'hidden' // Allow scrolling when zoomed in
        }}
      >
        <div 
          className={\`flex \${displayMode === 'webtoon' ? 'flex-col items-center gap-4 w-full' : 'gap-2'}\`}
        >
          {pageUrls.map((url, i) => (
            <img
              key={url + i}
              src={url}
              alt={\`Página \${page + i}\`}
              draggable={false}
              style={{
                width: displayMode === 'webtoon' ? \`\${Math.min(100, zoom)}%\` : 'auto',
                height: displayMode !== 'webtoon' ? \`\${zoom}vh\` : 'auto',
                objectFit: 'contain'
              }}
              className="max-w-none max-h-none"
            />
          ))}
        </div>
      </div>

      {/* Click zones */}`;

content = content.replace(imageAreaRegex, newImageArea);

fs.writeFileSync(path, content);
console.log('Update reader zoom complete.');
