// web/src/utils/dictionary.js
import fs from 'node:fs';
import path from 'node:path';

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTitle(str) {
  if (!str) return str;
  return str
    .split(/[-_]/) 
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getDictionaryPaths() {
  const dataDir = path.resolve('../data-text/inglisce');
  const pagesToGenerate = [];

  function scanDirectory(currentPath, routePath) {
    let stat;
    try {
      stat = fs.statSync(currentPath);
    } catch (err) {
      return; // Skip silently if the file path is broken or inaccessible
    }

    // 1. Handle Files
    if (stat.isFile()) {
       if (path.basename(currentPath).startsWith('.')) return;
       
       const content = fs.readFileSync(currentPath, 'utf-8');
       const ext = path.extname(currentPath);
       
       pagesToGenerate.push({
         params: { slug: routePath },
         props: { 
            type: 'file', 
            title: formatTitle(path.basename(currentPath, ext)), 
            content, 
            ext, 
            isRoot: false
         }
       });
       return;
    }

    // 2. Handle Directories (Strictly guarded to prevent ENOTDIR)
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      const contents = [];
      let indexContent = null, indexExt = null; 

      for (const entry of entries) {
         if (entry.name.startsWith('.')) continue;
         
         if (entry.isFile() && (entry.name === 'index.md' || entry.name === 'index.txt')) {
           indexContent = fs.readFileSync(path.join(currentPath, entry.name), 'utf-8');
           indexExt = path.extname(entry.name);
           continue; 
         }
         
         const cleanName = entry.name.replace(/\.(md|txt)$/, '');
         const childRoute = routePath ? `${routePath}/${cleanName}` : cleanName;
         
         // Apply formatTitle here so links display beautifully
         contents.push({
           name: formatTitle(cleanName),
           isDir: entry.isDirectory(),
           href: `/${childRoute}`
         });

         if (entry.isDirectory() || entry.isFile()) {
           scanDirectory(path.join(currentPath, entry.name), childRoute);
         }
      }

      const isRoot = routePath === '';
      const pageTitle = isRoot ? 'Inglisce Dictionary' : formatTitle(path.basename(currentPath));

      pagesToGenerate.push({
        params: { slug: routePath || undefined }, 
        props: { 
          type: 'directory', 
          title: pageTitle,
          contents, 
          content: indexContent, 
          ext: indexExt, 
          isRoot
        }
      });
    }
  }

  scanDirectory(dataDir, '');
  return pagesToGenerate;
}