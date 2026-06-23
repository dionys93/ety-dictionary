// web/src/pages/api/save-glyph.json.js
export const prerender = false;
import fs from 'fs';
import path from 'path';

export const POST = async ({ request }) => {
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Disabled in production.' }), { status: 403 });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Empty payload.' }), { status: 400 });
    }

    const data = JSON.parse(rawBody);
    
    // --- NEW: We now extract the category tag as well ---
    const { name, category, paths } = data;

    if (!name || !paths) {
      return new Response(JSON.stringify({ error: 'Missing name or paths' }), { status: 400 });
    }

    const fileName = `${name.toLowerCase().replace(/\s+/g, '_')}.json`;
    const dirPath = path.resolve(process.cwd(), 'glyphs');
    const filePath = path.join(dirPath, fileName);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // --- NEW: Save the category into the JSON file (defaults to 'Custom' if none provided) ---
    fs.writeFileSync(filePath, JSON.stringify({ name, category: category || 'Custom', paths }, null, 2));

    return new Response(JSON.stringify({ success: true, message: `Saved to ${fileName}` }), { status: 200 });

  } catch (error) {
    console.error("[API] Server Crash:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};