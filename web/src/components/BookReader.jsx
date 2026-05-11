import React, { useRef, forwardRef } from 'react';
import HTMLFlipBook from 'react-pageflip';

// The forwardRef attaches the library's 3D engine to the outer div
const Page = forwardRef((props, ref) => {
    return (
        // OUTER NODE: Fallback color matches the edge of the paper
        <div className="page" ref={ref} style={{ backgroundColor: '#fdfbf7', overflow: 'hidden' }}>
            
            {/* INNER NODE: 100% controlled by our CSS. */}
            <div style={innerPageStyle}>
                
                <div className="page-content" style={contentStyle}>
                    {props.children}
                </div>
                
                {/* Only render the footer if a page number is provided */}
                {props.number && (
                    <div className="page-footer" style={footerStyle}>
                        {props.number}
                    </div>
                )}

            </div>
        </div>
    );
});

export default function BookReader({ pages }) {
    const bookRef = useRef();

    const goNextPage = () => {
        bookRef.current.pageFlip().flipNext();
    };

    const goPrevPage = () => {
        bookRef.current.pageFlip().flipPrev();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            
            <HTMLFlipBook 
                width={550} 
                height={750} 
                size="stretch"
                minWidth={315}
                maxWidth={1000}
                minHeight={400}
                maxHeight={1533}
                maxShadowOpacity={0.5}
                showCover={true}
                usePortrait={true}
                ref={bookRef}
                className="inglisce-flipbook"
            >
                {/* --- COVER PAGE --- */}
                <Page>
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <h1 style={{ color: '#2c241b', fontSize: '3rem', textAlign: 'center', margin: 0, fontFamily: 'serif' }}>
                            Inglisce<br/>Lîbrarie
                        </h1>
                    </div>
                </Page>
                
                {/* --- BOOK PAGES --- */}
                {pages.map((pageContent, index) => (
                    <Page number={index + 1} key={index}>
                        {pageContent}
                    </Page>
                ))}
            </HTMLFlipBook>

            {/* Bottom Navigation Component */}
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button onClick={goPrevPage} style={buttonStyle}>
                    ← Prev
                </button>
                <button onClick={goNextPage} style={buttonStyle}>
                    Next →
                </button>
            </div>

        </div>
    );
}

// --- STYLES ---

const innerPageStyle = {
    backgroundColor: '#fdfbf7', // A much brighter, warm ivory
    height: '100%',
    width: '100%',
    display: 'flex', 
    flexDirection: 'column',
    border: '1px solid #dcd3c6', // Softened the border slightly
    boxShadow: 'inset 0 0 30px rgba(139, 115, 85, 0.06)', // Lightened the inner shadow
    boxSizing: 'border-box'
};

const contentStyle = {
    flex: 1, 
    padding: '3rem 3rem 1rem 3rem', 
    whiteSpace: 'pre-wrap', 
    fontFamily: 'serif', 
    fontSize: '1.15rem',
    lineHeight: '1.6',
    color: '#2c241b', 
    overflowY: 'auto', 
    boxSizing: 'border-box'
};

const footerStyle = {
    height: '60px',
    flexShrink: 0, 
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9a856a', // Slightly lighter brown for harmony
    fontSize: '1rem',
    fontFamily: 'sans-serif',
    backgroundColor: '#f4efe6', // A much lighter, soft cream/beige
    borderTop: '2px solid #e2d7c5', // Softened the cutoff line
    boxSizing: 'border-box'
};

const buttonStyle = {
    padding: '0.6rem 1.5rem',
    cursor: 'pointer',
    backgroundColor: '#2c241b', 
    color: '#fdfbf7', // Matches the new page color
    border: 'none',
    borderRadius: '6px',
    fontWeight: '600',
    transition: 'opacity 0.2s ease'
};