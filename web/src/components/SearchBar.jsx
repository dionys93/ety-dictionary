import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const pagefindRef = useRef(null);

 useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Built from a variable, not a string literal, so Rollup treats this
        // as unanalyzable and leaves it as a runtime-only import. The file
        // itself doesn't exist until the `pagefind` postbuild step runs, so
        // it must never be resolved at build time.
        const pagefindUrl = '/pagefind/pagefind.js';
        const pf = await import(/* @vite-ignore */ `${pagefindUrl}`);
        if (cancelled) return;
        await pf.init?.();
        pagefindRef.current = pf;
        setReady(true);
      } catch (err) {
        console.warn('[SearchBar] No Pagefind index found — run `npm run build`.', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runSearch = useCallback(async (value) => {
    if (!pagefindRef.current) return;
    if (!value.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const search = await pagefindRef.current.debouncedSearch(value);
    if (!search) return; // superseded by a newer keystroke
    const pages = await Promise.all(search.results.slice(0, 15).map((r) => r.data()));
    const flattened = pages.flatMap((page) =>
      page.sub_results?.length
        ? page.sub_results.map((sub) => ({ title: sub.title, url: sub.url, excerpt: sub.excerpt }))
        : [{ title: page.meta?.title || page.url, url: page.url, excerpt: page.excerpt }]
    );
    setResults(flattened);
    setLoading(false);
  }, []);

  function handleChange(e) {
    setQuery(e.target.value);
    runSearch(e.target.value);
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="search"
        value={query}
        onChange={handleChange}
        disabled={!ready}
        placeholder={ready ? 'Search the dictionary…' : 'Search unavailable in dev — run a build'}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.85rem',
          borderRadius: '5px', border: '1px solid #ddd', fontSize: '0.95rem',
          fontFamily: 'inherit', backgroundColor: ready ? '#fff' : '#f7f7f7',
        }}
      />
      {loading && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.4rem' }}>Searching…</div>}
      {!loading && results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '55vh', overflowY: 'auto' }}>
          {results.map((r, i) => (
            <li key={`${r.url}-${i}`}>
              <a href={r.url} style={{ display: 'block', padding: '0.5rem 0.75rem', backgroundColor: '#f7f7f7', border: '1px solid #ddd', borderRadius: '5px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                {r.excerpt && <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: r.excerpt }} />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}