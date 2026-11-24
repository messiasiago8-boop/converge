import fs from 'fs';

const filePath = 'C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Head Google Fonts Inter
const oldFont = `<style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }`;
const newFont = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }`;

if (html.includes(oldFont)) {
  html = html.replace(oldFont, newFont);
}

// 2. Body background
html = html.replace(
  'class="bg-slate-100 text-slate-800 antialiased min-h-screen flex"',
  'class="bg-slate-50 text-slate-800 antialiased min-h-screen flex font-sans"'
);

// 3. Sidebar styling
html = html.replace(
  'class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 min-h-screen z-20"',
  'class="w-64 bg-slate-950 border-r border-slate-900 flex flex-col justify-between shrink-0 min-h-screen z-20"'
);
html = html.replace(
  'class="h-16 px-4 border-b border-slate-800 bg-slate-950/60 flex items-center gap-3"',
  'class="h-16 px-5 border-b border-slate-900/80 bg-slate-950 flex items-center gap-3.5"'
);
html = html.replace(
  'class="p-4 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400 flex items-center justify-between"',
  'class="p-4 border-t border-slate-900 bg-slate-950/80 text-xs text-slate-400 flex items-center justify-between"'
);

const activeBtnClass = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-blue-400 bg-blue-900/30 border-l-4 border-blue-500 transition cursor-pointer text-left';
const inactiveBtnClass = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer text-left';

html = html.replace(
  'id="navAbaDashboard" class="w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-bold text-white bg-blue-600 transition cursor-pointer text-left shadow-xs"',
  `id="navAbaDashboard" class="${activeBtnClass}"`
);

const navIds = ['navAbaPlanilha', 'navAbaIa', 'navAbaInvestimentosFuturo', 'navAbaProjetosCompras', 'navAbaInvestimentos', 'navAbaRelatorios'];
navIds.forEach(nId => {
  const regex = new RegExp(`id="${nId}" class="[^"]+"`);
  html = html.replace(regex, `id="${nId}" class="${inactiveBtnClass}"`);
});

// Update alternarAba function in JS to use new classes
const oldActiveJs = 'elNav.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-semibold text-white bg-blue-600 transition cursor-pointer text-left";';
const oldInactiveJs = 'elNav.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer text-left";';

html = html.replace(oldActiveJs, `elNav.className = "${activeBtnClass}";`);
html = html.replace(oldInactiveJs, `elNav.className = "${inactiveBtnClass}";`);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Sidebar and typography successfully updated');
