const fs = require('fs');

const path = 'src/pages/Reader.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fully open up the overflow on all wrappers to let the browser natively scroll
content = content.replace(/className=\{\`h-screen bg-black flex flex-col select-none \$\{displayMode === 'webtoon' \? 'overflow-y-auto' : 'overflow-hidden'\}\`\}/g, 
  `className={\`h-screen bg-black flex flex-col select-none \${zoom > 100 || displayMode === 'webtoon' ? 'overflow-auto' : 'overflow-hidden'}\`}`);

content = content.replace(/className=\{\`flex-1 \$\{displayMode === 'webtoon' \? 'w-full pt-16 pb-20' : \\\`flex justify-center \$\{zoom > 100 \? 'items-start' : 'items-center'\}\\\`\}\`\}/g, 
  `className={\`flex-1 \${displayMode === 'webtoon' ? 'w-full pt-16 pb-20' : \`flex justify-center \${zoom > 100 ? 'items-start' : 'items-center'}\`}\`}`);

// 2. Fix Keyboard logic to be foolproof
const kbRegex = /const onKeyDown = \(e: KeyboardEvent\) => \{[\s\S]*?window\.addEventListener\('keydown', onKeyDown\);/m;
const newKbLogic = `const onKeyDown = (e: KeyboardEvent) => {
      // Bloqueia rolagem APENAS para os atalhos de navegação
      if (['ArrowRight', 'ArrowLeft', ' '].includes(e.key) && e.target === document.body) {
        e.preventDefault(); 
      }
      
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate('/');
      
      // Para ArrowUp e ArrowDown, tentamos rolar TUDO que for possível para garantir
      else if (e.key === 'ArrowUp') {
        window.scrollBy({ top: -150, behavior: 'smooth' });
        outerContainerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
        scrollContainerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
      }
      else if (e.key === 'ArrowDown') {
        window.scrollBy({ top: 150, behavior: 'smooth' });
        outerContainerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
        scrollContainerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKeyDown);`;

content = content.replace(kbRegex, newKbLogic);

fs.writeFileSync(path, content);
console.log('Fixed scroll');
