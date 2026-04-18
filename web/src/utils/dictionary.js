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

  const getStatSafe = (targetPath) => {
    try {
      return fs.statSync(targetPath);
    } catch {
      return null;
    }
  };

  function scanDirectory(currentPath, routePath) {
    const stat = getStatSafe(currentPath);
    if (!stat) return;

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

    // 2. Handle Directories
    if (stat.isDirectory()) {
      const rawEntries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      // Filter out hidden files immediately
      const validEntries = rawEntries.filter(entry => !entry.name.startsWith('.'));

      // Find the index file explicitly instead of catching it in a loop
      const indexFile = validEntries.find(entry => 
        entry.isFile() && (entry.name === 'index.md' || entry.name === 'index.txt')
      );

      // We only read the file if indexFile was successfully found
      const indexContent = indexFile ? fs.readFileSync(path.join(currentPath, indexFile.name), 'utf-8') : null;
      const indexExt = indexFile ? path.extname(indexFile.name) : null;

      // Filter out the index file, then map the rest into your navigation array
      const contents = validEntries
        .filter(entry => entry !== indexFile)
        .map(entry => {
          const cleanName = entry.name.replace(/\.(md|txt)$/, '');
          const childRoute = routePath ? `${routePath}/${cleanName}` : cleanName;
          
          // Trigger the recursive scan for valid items
          if (entry.isDirectory() || entry.isFile()) {
            scanDirectory(path.join(currentPath, entry.name), childRoute);
          }

          return {
            name: formatTitle(cleanName),
            isDir: entry.isDirectory(),
            href: `/${childRoute}`
          };
        });

      const isRoot = routePath === '';
      const pageTitle = isRoot ? 'Inglisce' : formatTitle(path.basename(currentPath));

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