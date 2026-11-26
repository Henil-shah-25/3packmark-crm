const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/Henil Shah/.gemini/antigravity/brain/3ac6cbcd-b8a7-475b-9735-8ed7a4804763/.system_generated/logs/transcript.jsonl'),
  crlfDelay: Infinity
});
rl.on('line', (line) => {
  if (line.includes('"type":"USER_INPUT"')) {
    const o = JSON.parse(line);
    console.log(o.step_index, o.content ? o.content.slice(0, 100).replace(/\n/g, ' ') : 'no content');
  }
});

