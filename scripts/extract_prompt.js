const fs = require('fs');
const readline = require('readline');

async function run() {
  const fileStream = fs.createReadStream('C:/Users/Henil Shah/.gemini/antigravity/brain/3ac6cbcd-b8a7-475b-9735-8ed7a4804763/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":2331')) {
      const parsed = JSON.parse(line);
      fs.writeFileSync('scripts/prompt_polish.txt', parsed.content, 'utf8');
      console.log('Successfully saved prompt_polish.txt, length:', parsed.content.length);
      break;
    }
  }
}

run();

