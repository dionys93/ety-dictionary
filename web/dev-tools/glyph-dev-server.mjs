// web/dev-tools/glyph-dev-server.mjs
import fs from 'node:fs';
import path from 'node:path';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function glyphDevApi() {
  return {
    name: 'glyph-dev-api',
    hooks: {
      'astro:server:setup': ({ server }) => {
        const dirPath = path.resolve(process.cwd(), 'glyphs');

        server.middlewares.use('/api/get-glyphs.json', (req, res) => {
          if (req.method !== 'GET') return res.end();
          try {
            if (!fs.existsSync(dirPath)) {
              res.setHeader('Content-Type', 'application/json');
              return res.end('[]');
            }
            const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
            const glyphs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8')));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(glyphs));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });

        server.middlewares.use('/api/save-glyph.json', async (req, res) => {
          if (req.method !== 'POST') return res.end();
          try {
            const { name, category, paths } = JSON.parse(await readBody(req));
            if (!name || !paths) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Missing name or paths' }));
            }
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            const fileName = `${name.toLowerCase().replace(/\s+/g, '_')}.json`;
            fs.writeFileSync(
              path.join(dirPath, fileName),
              JSON.stringify({ name, category: category || 'Custom', paths }, null, 2)
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, message: `Saved to ${fileName}` }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      },
    },
  };
}