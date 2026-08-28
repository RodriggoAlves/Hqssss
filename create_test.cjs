const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createTestComic() {
  const zip = new JSZip();
  
  // Create a dummy image (1x1 red pixel base64)
  const redPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bluePixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  
  zip.file("01_capa.png", redPixel, {base64: true});
  zip.file("02_pagina.png", bluePixel, {base64: true});

  const content = await zip.generateAsync({type:"nodebuffer"});
  
  fs.writeFileSync(path.join(process.env.USERPROFILE, "Desktop", "Batman_Teste_01.cbz"), content);
  console.log("Arquivo CBZ criado na área de trabalho!");
}

createTestComic();
