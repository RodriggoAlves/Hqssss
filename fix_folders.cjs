const fs = require('fs');

const path = 'src/pages/Home.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldLogic = `        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 1) {
            topic = parts[0]; // Top level folder name becomes the topic
          }
        }`;

const newLogic = `        if (isFolder && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          // Se parts for ['HQs', 'DC', 'arquivo.cbz'], queremos pegar 'DC' (parts[1])
          // Se for ['Batman', 'arquivo.cbz'], queremos pegar 'Batman' (parts[0])
          if (parts.length > 2) {
            topic = parts[1]; // Pega a subpasta direta logo abaixo da pasta raiz selecionada
          } else if (parts.length > 1) {
            topic = parts[0]; // Pega a pasta raiz
          }
        }`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  fs.writeFileSync(path, content);
  console.log('Update fix_folders complete.');
} else {
  console.log('Logic not found. Maybe already updated?');
}
