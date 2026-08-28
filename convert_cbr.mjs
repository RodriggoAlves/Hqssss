import fs from 'fs';
import path from 'path';
import { RarArchive } from '@bitplane/rars';
import JSZip from 'jszip';

const targetDir = "D:\\HQs\\DC\\Universo absoluto\\Flash absoluto";

async function convertCbrToCbz() {
  if (!fs.existsSync(targetDir)) {
    console.log("Diretório não encontrado: ", targetDir);
    return;
  }

  const files = fs.readdirSync(targetDir);
  const cbrFiles = files.filter(f => f.toLowerCase().endsWith('.cbr') || f.toLowerCase().endsWith('.rar'));

  if (cbrFiles.length === 0) {
    console.log("Nenhum arquivo .cbr encontrado.");
    return;
  }

  console.log(`Encontrados ${cbrFiles.length} arquivos CBR. Iniciando conversão para CBZ...`);

  for (const file of cbrFiles) {
    const fullPath = path.join(targetDir, file);
    const cbzPath = path.join(targetDir, file.replace(/\.(cbr|rar)$/i, '.cbz'));
    
    if (fs.existsSync(cbzPath)) {
      console.log(`[PULANDO] ${cbzPath} já existe.`);
      continue;
    }

    console.log(`[CONVERTENDO] ${file} -> .cbz`);
    
    try {
      // Load RAR
      const archive = await RarArchive.open(fullPath);
      const zip = new JSZip();
      
      let count = 0;
      for (const entry of archive.entries) {
        if (entry.isDirectory) continue;
        const name = entry.name;
        // console.log(`  - Extraindo ${name}`);
        const bytes = await archive.get(name).bytes();
        zip.file(name, bytes);
        count++;
      }
      
      archive.close();
      
      // Save ZIP
      console.log(`  Compactando ${count} páginas em CBZ...`);
      const content = await zip.generateAsync({
        type: "nodebuffer",
        compression: "STORE" // Store without re-compressing images is much faster
      });
      
      fs.writeFileSync(cbzPath, content);
      console.log(`[SUCESSO] ${file} convertido! Você pode importar o .cbz no leitor agora.\n`);
      
    } catch (err) {
      console.error(`[ERRO] Falha ao converter ${file}:`, err);
    }
  }
  console.log("Processo concluído!");
}

convertCbrToCbz();
