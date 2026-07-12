// web/src/utils/dictionary.js
import fs from 'node:fs';
import path from 'node:path';
import { getRouteFeatures } from '../config/routeFeatures.js';

const DATA_DIR = '../data-text/inglisce';

function getStatSafe(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function formatTitle(str) {
  if (!str) return str;
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Recursively scans a content directory into a plain tree of file/directory
 * nodes. Contains no knowledge of Astro's getStaticPaths shape — this is
 * pure filesystem + formatting logic, safe to unit-test or reuse (a sitemap,
 * a search index, etc.) without any Astro involved.
 *
 * File node shape:   { type: 'file', routePath, title, content, ext }
 * Directory node shape: { type: 'directory', routePath, title, isRoot,
 *                         content, ext, bookPages, children }
 */
export function scanContentTree(currentPath, routePath) {
  const stat = getStatSafe(currentPath);
  if (!stat) return null;

  // --- File node ---
  if (stat.isFile()) {
    if (path.basename(currentPath).startsWith('.')) return null;

    const ext = path.extname(currentPath);
    const content = fs.readFileSync(currentPath, 'utf-8');

    return {
      type: 'file',
      routePath,
      title: formatTitle(path.basename(currentPath, ext)),
      content,
      ext,
    };
  }

  // --- Directory node ---
  const rawEntries = fs.readdirSync(currentPath, { withFileTypes: true });

  // Filter out hidden files immediately
  const validEntries = rawEntries.filter(entry => !entry.name.startsWith('.'));

  // Find the index file explicitly
  const indexFile = validEntries.find(entry =>
    entry.isFile() && (entry.name === 'index.md' || entry.name === 'index.txt')
  );

  // Detect Book Pages: files that are strictly numbers (e.g. "1.txt", "12.txt")
  const pageFiles = validEntries.filter(entry =>
    entry.isFile() && /^\d+\.txt$/.test(entry.name)
  );

  const bookPages = pageFiles.length > 0
    ? pageFiles
        // Sort numerically (so "10.txt" comes after "9.txt", not "1.txt")
        .sort((a, b) => parseInt(a.name) - parseInt(b.name))
        .map(entry => fs.readFileSync(path.join(currentPath, entry.name), 'utf-8'))
    : null;

  const indexContent = indexFile ? fs.readFileSync(path.join(currentPath, indexFile.name), 'utf-8') : null;
  const indexExt = indexFile ? path.extname(indexFile.name) : null;

  // Everything else is a navigable child (subfolder, or standalone entry file)
  const navEntries = validEntries.filter(entry =>
    entry !== indexFile && !pageFiles.includes(entry)
  );

  const children = navEntries
    .map(entry => {
      const cleanName = entry.name.replace(/\.(md|txt)$/, '');
      const childRoute = routePath ? `${routePath}/${cleanName}` : cleanName;
      return scanContentTree(path.join(currentPath, entry.name), childRoute);
    })
    .filter(Boolean); // drop unreadable/hidden children rather than than leaving a gap

  const isRoot = routePath === '';

  return {
    type: 'directory',
    routePath,
    title: isRoot ? 'Inglisce' : formatTitle(path.basename(currentPath)),
    isRoot,
    content: indexContent,
    ext: indexExt,
    bookPages,
    children,
  };
}

/**
 * Walks the content tree and produces the exact { params, props } shape
 * Astro's `getStaticPaths` expects — the only place in this file that knows
 * about that shape. A directory's nav `contents` are derived directly from
 * its children's own routePath/title/type, so they can't drift out of sync
 * with the pages those children actually generate.
 *
 * Traversal is post-order (children flattened before the parent's own page)
 * to match the original page ordering.
 */
export function flattenToStaticPaths(node) {
  if (node.type === 'file') {
    return [{
      params: { slug: node.routePath },
      props: {
        type: 'file',
        title: node.title,
        content: node.content,
        ext: node.ext,
        isRoot: false,
        ...getRouteFeatures(node.routePath),
      },
    }];
  }

  // Directory node
  const contents = node.children.map(child => ({
    name: child.title,
    isDir: child.type === 'directory',
    href: `/${child.routePath}`,
  }));

  const childPages = node.children.flatMap(flattenToStaticPaths);

  const ownPage = {
    params: { slug: node.routePath || undefined },
    props: {
      type: 'directory',
      title: node.title,
      contents,
      content: node.content,
      ext: node.ext,
      bookPages: node.bookPages,
      isRoot: node.isRoot,
      ...getRouteFeatures(node.routePath),
    },
  };

  return [...childPages, ownPage];
}

export function getDictionaryPaths() {
  const dataDir = path.resolve(DATA_DIR);
  const tree = scanContentTree(dataDir, '');
  return tree ? flattenToStaticPaths(tree) : [];
}