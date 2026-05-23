import React from 'react';

function AboutPage() {
  return (
    <div className="about-page" style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      
      {/* Hero Header Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))',
        borderRadius: '16px',
        padding: '3rem 2rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle accent glow */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />
        
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          marginBottom: '1rem'
        }}>
          About "Happy Customer"
        </h1>
        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '700px', margin: '0 auto 2rem', lineHeight: '1.6' }}>
          A high-performance, full-stack demonstration project designed to showcase modern software engineering practices, clean architectures, and advanced data processing capabilities using Go and React.
        </p>

        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)' }}>Miguel Borja</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.85rem' }}>Full-Stack Software Engineer</p>
          <a 
            href="mailto:miguel.borja@gmail.com" 
            style={{
              marginTop: '1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'var(--accent)',
              color: 'white',
              textDecoration: 'none',
              padding: '0.85rem 2rem',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1rem',
              transition: 'var(--transition)',
              boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)'
            }}
            className="btn-primary"
          >
            ✉️ Contact Me: miguel.borja@gmail.com
          </a>
        </div>
      </div>

      {/* Project Idea / Motivation Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '2rem',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#60a5fa' }}>💡 Project Vision</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            The application is built to demonstrate real-world full-stack capabilities, bridging a low-overhead Go API with a highly responsive React frontend. 
            It solves a practical problem: aggregate and structure classified car listings into an optimized search index, allowing fast queries, custom calculations, and intelligent favorites tracking.
          </p>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '2rem',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#a78bfa' }}>⚡ Key Highlight: Concurrent Worker Pool</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            To migrate <strong>9,413 listings</strong> from a local SQLite database to the cloud over the internet, a sequential database query approach would have taken over 40 minutes due to network round-trip latencies.
            Instead, I implemented a <strong>highly concurrent Go worker pool (50 parallel workers)</strong> that safely executed upserts in parallel, successfully completing the entire database migration in <strong>just 52 seconds</strong> (nearly a 50x speedup!).
          </p>
        </div>
      </div>

      {/* Tech Stack Pillars */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>🛠️ Technical Architecture & Showcase</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Go pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(0, 192, 240, 0.1)', color: '#00add8', borderRadius: '8px', fontWeight: 'bold' }}>Go</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Backend & Concurrent Web Scraping</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                Built a performant backend in Go that hosts standard REST endpoints, runs background scraping routines concurrently via goroutines, and interfaces directly with local SQLite or remote PostgreSQL. Bundles background drivers using Selenium ChromeDriver to crawl and parse listings automatically.
              </p>
            </div>
          </div>

          {/* React pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(97, 218, 251, 0.1)', color: '#61dafb', borderRadius: '8px', fontWeight: 'bold' }}>JSX</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Responsive React Frontend & Vanilla CSS</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                Constructed a premium dark-mode interface utilizing modern Vanilla CSS for rich glassmorphism aesthetics. Implemented responsive grid layouts, custom hooks for persistent states (seen listings, favorites), real-time polling to update statistics, and highly intuitive search/sorting dashboards.
              </p>
            </div>
          </div>

          {/* Database pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '8px', fontWeight: 'bold' }}>SQL</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Dual Database & Automated Migrations</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                Designed an SQLite database layer that seamlessly upgrades to Supabase PostgreSQL in production using the <code>lib/pq</code> driver. Implemented a runtime query translator to bridge SQLite <code>?</code> placeholders with PostgreSQL <code>$1</code> parameters dynamically, along with database indices for sub-millisecond queries.
              </p>
            </div>
          </div>

          {/* Docker/Cloud pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(36, 150, 237, 0.1)', color: '#2496ed', borderRadius: '8px', fontWeight: 'bold' }}>📦</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>DevOps, Docker Containerization & Cloud Deployment</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                Created a multi-stage <code>Dockerfile</code> that builds React static assets and Go binaries together in a unified production image. Deployed in Oregon (US West) on Render to achieve physical proximity to the Supabase server, eliminating cross-country networking overheads.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Footer message */}
      <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Designed and coded by Miguel Borja © 2026. Made with ❤️ using React & Go.
      </div>
      
    </div>
  );
}

export default AboutPage;
