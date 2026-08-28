const fs = require('fs');
const comics = JSON.parse(fs.readFileSync('comics.json'));
console.log(comics[0]);
