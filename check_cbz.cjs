const JSZip = require('jszip');
const fs = require('fs');
JSZip.loadAsync(fs.readFileSync('D:\\HQs\\DC\\Universo absoluto\\Flash absoluto\\Flash Absoluto #01.cbz'))
  .then(z => console.log(Object.keys(z.files).slice(0, 10)));
