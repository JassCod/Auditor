// Inlines src/ into one page.
//   dist/artifact.html  body fragment (for hosts that add their own document shell)
//   index.html          complete document for GitHub Pages or any static host
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const page = r('shell.html')
  .replace('/*@@STYLES@@*/', () => r('styles.css'))
  .replace('/*@@ENGINE@@*/', () => r('engine.js'))
  .replace('/*@@SAMPLE@@*/', () => r('sample.js'))
  .replace('/*@@STAGE@@*/', () => r('stage.js'))
  .replace('/*@@APP@@*/', () => r('app.js'));
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/artifact.html', import.meta.url), page);
writeFileSync(new URL('../index.html', import.meta.url),
  '<!doctype html>\n<html lang="en-AU">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  page.replace(/<\/style>\n/, '</style>\n</head>\n<body>\n') + '</body>\n</html>\n');
console.log('built', page.length, 'bytes');
