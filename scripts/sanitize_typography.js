const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walk(fullPath, fileList);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = walk('src');

const phraseReplacements = [
  ['REVENUE TREND', 'Revenue trend'],
  ['WON THIS MONTH', 'Won this month'],
  ['OPEN PIPELINE', 'Open pipeline'],
  ['WIN RATE', 'Win rate'],
  ['HOT OPPORTUNITIES', 'Hot opportunities'],
  ['PRIORITY', 'Priority'],
  ['MOVE DEAL STAGE', 'Move deal stage'],
  ['Move Deal Stage', 'Move deal stage'],
  ['ACCOUNT INFORMATION', 'Account information'],
  ['Account Information', 'Account information'],
  ['NEW LEAD', 'New lead'],
  ['New Lead', 'New lead'],
  ['WIN PROB', 'Win prob'],
  ['Win Prob', 'Win prob'],
  ['SELECT WORKSPACE', 'Select workspace'],
  ['Select Workspace', 'Select workspace'],
  ['EXECUTION SUMMARY', 'Execution summary'],
  ['Execution Summary', 'Execution summary'],
  ['STEP BREAKDOWN', 'Step breakdown'],
  ['Step Breakdown', 'Step breakdown'],
  ['ACTIVE PIPELINE DISTRIBUTION', 'Active pipeline distribution'],
  ['Active Pipeline Distribution', 'Active pipeline distribution'],
  ['MONTHLY QUOTA REALIZATION', 'Monthly quota realization'],
  ['Monthly Quota Realization', 'Monthly quota realization'],
  ['COMPANY NAME', 'Company name'],
  ['PRIMARY CONTACT', 'Primary contact'],
  ['INITIAL LIFETIME VALUE', 'Initial lifetime value'],
  ['EMAIL TEMPLATES', 'Email templates'],
  ['LEAD STATUS', 'Lead status'],
  ['Lead Status', 'Lead status'],
  ['DEAL VALUE', 'Deal value'],
  ['Deal Value', 'Deal value'],
  ['EXPECTED CLOSE', 'Expected close'],
  ['Expected Close', 'Expected close'],
  ['ASSIGNED OWNER', 'Assigned owner'],
  ['Assigned Owner', 'Assigned owner'],
  ['NEXT ACTION', 'Next action'],
  ['Next Action', 'Next action']
];

let modifiedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. In CSS files, remove text-transform: uppercase and letter-spacing from labels/badges
  if (file.endsWith('.css')) {
    content = content.replace(/text-transform:\s*uppercase;?/gi, '');
  }

  // 2. In TSX files:
  if (file.endsWith('.tsx')) {
    // Replace uppercase classes in className
    // Be careful not to alter .toUpperCase() JS methods!
    // We target className="..." strings
    content = content.replace(/className=(["`])([^"`]*)\1/g, (match, quote, classStr) => {
      let cleaned = classStr
        .replace(/\buppercase\b/g, '')
        .replace(/\btracking-widest\b/g, '')
        .replace(/\btracking-wider\b/g, '')
        .replace(/\btracking-wide\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return `className=${quote}${cleaned}${quote}`;
    });

    // Replace uppercase phrases in JSX text or titles
    for (const [from, to] of phraseReplacements) {
      // Replace whole words/tags
      content = content.split(`>${from}<`).join(`>${to}<`);
      content = content.split(`"${from}"`).join(`"${to}"`);
      content = content.split(`'${from}'`).join(`'${to}'`);
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log('Sanitized typography in:', file);
  }
}

console.log(`Total files sanitized: ${modifiedCount}`);

