// web/src/pages/api/get-glyphs.json.js
export const prerender = false;
import fs from 'fs';
import path from 'path';

export const GET = async () => {
  try {
    const dirPath = path.resolve(process.cwd(), 'glyphs');
    
    // If the folder doesn't exist yet, just return an empty array
    if (!fs.existsSync(dirPath)) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    // Find all JSON files in the directory
    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
    
    // Read and parse each file
    const glyphs = files.map(file => {
      const rawData = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      return JSON.parse(rawData);
    });

    return new Response(JSON.stringify(glyphs), { status: 200 });

  } catch (error) {
    console.error("[API] Error fetching glyphs:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};