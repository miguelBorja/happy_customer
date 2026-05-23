import React from 'react';
import { useLanguage } from '../context/LanguageContext';

function AboutPage() {
  const { t } = useLanguage();

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
          {t('aboutTitle')}
        </h1>
        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '700px', margin: '0 auto 2rem', lineHeight: '1.6' }}>
          {t('aboutSubtitle')}
        </p>

        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)' }}>Miguel Borja</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.85rem' }}>{t('devSubtitle')}</p>
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
            {t('contactMe')}
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
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#60a5fa' }}>{t('projectVisionTitle')}</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            {t('projectVisionText')}
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
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#a78bfa' }}>{t('workerPoolTitle')}</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            {t('workerPoolText')}
          </p>
        </div>
      </div>

      {/* Tech Stack Pillars */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>{t('techShowcaseTitle')}</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Go pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(0, 192, 240, 0.1)', color: '#00add8', borderRadius: '8px', fontWeight: 'bold' }}>Go</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{t('goPillarTitle')}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                {t('goPillarText')}
              </p>
            </div>
          </div>

          {/* React pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(97, 218, 251, 0.1)', color: '#61dafb', borderRadius: '8px', fontWeight: 'bold' }}>JSX</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{t('reactPillarTitle')}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                {t('reactPillarText')}
              </p>
            </div>
          </div>

          {/* Database pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '8px', fontWeight: 'bold' }}>SQL</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{t('dbPillarTitle')}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                {t('dbPillarText')}
              </p>
            </div>
          </div>

          {/* Docker/Cloud pillar */}
          <div style={{ display: 'flex', gap: '1.5rem', backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(36, 150, 237, 0.1)', color: '#2496ed', borderRadius: '8px', fontWeight: 'bold' }}>📦</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{t('devopsPillarTitle')}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.5' }}>
                {t('devopsPillarText')}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Footer message */}
      <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {t('authorFooter')}
      </div>
      
    </div>
  );
}

export default AboutPage;
