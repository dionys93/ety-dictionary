import React, { useState } from 'react';

const VowelShiftVisualizer = () => {
  const [activeVowel, setActiveVowel] = useState(null);

  // Vowel data with SVG coordinates
  // X: Front (0) to Back (100) | Y: High (0) to Low (100)
  const shiftData = [
    { id: 'i', me: '/i:/', mod: '/aɪ/', word: 'bite', start: { x: 10, y: 10 }, end: { x: 40, y: 90 } },
    { id: 'e', me: '/e:/', mod: '/i:/', word: 'meet', start: { x: 15, y: 35 }, end: { x: 10, y: 10 } },
    { id: 'eps', me: '/ɛ:/', mod: '/i:/', word: 'meat', start: { x: 20, y: 60 }, end: { x: 10, y: 10 } },
    { id: 'a', me: '/a:/', mod: '/eɪ/', word: 'mate', start: { x: 25, y: 85 }, end: { x: 15, y: 35 } },
    { id: 'u', me: '/u:/', mod: '/aʊ/', word: 'out', start: { x: 90, y: 10 }, end: { x: 60, y: 90 } },
    { id: 'o', me: '/o:/', mod: '/u:/', word: 'boot', start: { x: 85, y: 35 }, end: { x: 90, y: 10 } },
    { id: 'open_o', me: '/ɔ:/', mod: '/oʊ/', word: 'boat', start: { x: 80, y: 60 }, end: { x: 85, y: 35 } },
  ];

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* Visualizer Area */}
      <div style={{ 
        width: '100%', 
        aspectRatio: '4 / 3', /* Modern aspect ratio handles sizing cleanly */
        backgroundColor: '#f9fafb', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        border: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Expanded viewBox (-10 to 110) creates an internal buffer so nothing clips */}
        <svg viewBox="-15 -10 130 120" style={{ width: '100%', height: '100%', display: 'block' }}>
          
          {/* Vowel Trapezoid Background */}
          <polygon 
            points="5,5 95,5 75,95 25,95" 
            fill="#f3f4f6" 
            stroke="#d1d5db" 
            strokeWidth="0.75" 
          />

          {/* Paths & Nodes */}
          {shiftData.map((vowel) => {
            const isActive = activeVowel === vowel.id;
            
            return (
              <g key={vowel.id}>
                {/* Arrow / Line Path */}
                <line
                  x1={vowel.start.x}
                  y1={vowel.start.y}
                  x2={vowel.end.x}
                  y2={vowel.end.y}
                  stroke={isActive ? "#3b82f6" : "transparent"}
                  strokeWidth="1.5"
                  strokeDasharray="4"
                  markerEnd={isActive ? "url(#arrow)" : ""}
                  style={{
                    transition: 'stroke 0.3s ease',
                  }}
                />
                
                {/* ME Vowel Node */}
                <circle 
                  cx={vowel.start.x} 
                  cy={vowel.start.y} 
                  r="3.5" 
                  fill={isActive ? "#2563eb" : "#9ca3af"} 
                  style={{ transition: 'fill 0.3s ease' }}
                />
                
                {/* Label */}
                <text 
                  x={vowel.start.x - 7} 
                  y={vowel.start.y + 1.5} 
                  fontSize="5" 
                  fill={isActive ? "#1e40af" : "#4b5563"}
                  fontWeight="bold"
                >
                  {vowel.me}
                </text>
              </g>
            );
          })}

          {/* SVG Definitions for Arrowhead */}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Control Panel */}
      <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {shiftData.map((vowel) => (
          <button
            key={vowel.id}
            onClick={() => setActiveVowel(vowel.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              backgroundColor: activeVowel === vowel.id ? '#3b82f6' : '#e5e7eb',
              color: activeVowel === vowel.id ? 'white' : '#374151',
              transition: 'all 0.2s'
            }}
          >
            {vowel.me}
          </button>
        ))}
        <button
          onClick={() => setActiveVowel(null)}
          style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
        >
          Reset
        </button>
      </div>

      {/* Data Output Panel */}
      <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', minHeight: '80px' }}>
        {activeVowel ? (() => {
          const activeData = shiftData.find(v => v.id === activeVowel);
          return (
            <p style={{ margin: 0, color: '#1e3a8a', fontSize: '1.1rem', textAlign: 'center' }}>
              Middle English <strong>{activeData.me}</strong> shifted to Modern English <strong>{activeData.mod}</strong> <br/>
              (e.g., <em>{activeData.word}</em>)
            </p>
          );
        })() : (
          <p style={{ margin: 0, color: '#60a5fa', textAlign: 'center', fontStyle: 'italic' }}>
            Select a Middle English vowel above to trace its shift.
          </p>
        )}
      </div>
    </div>
  );
};

export default VowelShiftVisualizer;