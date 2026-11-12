import { useLanguage } from '../context/LanguageContext';

function AboutPage({ stats }) {
  const { t } = useLanguage();

  return (
    <div className="about-page">
      
      {/* Hero Header Card */}
      <div className="about-hero">
        {/* Subtle accent glow */}
        <div className="about-hero-glow" />
        
        <h1 className="about-hero-title">
          {t('aboutTitle')}
        </h1>
        <p className="about-hero-subtitle">
          {t('aboutSubtitle')}
        </p>

        {/* Stats Grid Widget */}
        <div className="about-stats-grid">
          <div className="about-stat-card">
            <div className="about-stat-number about-stat-number--success">
              {stats?.active?.toLocaleString() || 0}
            </div>
            <div className="about-stat-label">
              {t('active')}
            </div>
          </div>

          <div className="about-stat-card">
            <div className="about-stat-number about-stat-number--danger">
              {stats?.sold?.toLocaleString() || 0}
            </div>
            <div className="about-stat-label">
              {t('sold')}
            </div>
          </div>

          <div className="about-stat-card">
            <div className="about-stat-number about-stat-number--accent">
              {stats?.visits?.toLocaleString() || 0}
            </div>
            <div className="about-stat-label">
              {t('visits')}
            </div>
          </div>
        </div>

        <div className="about-dev-box">
          <h2 className="about-dev-name">Miguel Borja</h2>
          <p className="about-dev-role">{t('devSubtitle')}</p>
          <a 
            href="mailto:miguel.borja@gmail.com" 
            className="about-dev-contact-btn btn-primary"
          >
            {t('contactMe')}
          </a>
        </div>
      </div>

      {/* Project Idea / Motivation Section */}
      <div className="about-pillars-grid">
        <div className="about-pillar-card">
          <h3 className="about-pillar-title about-pillar-title--blue">{t('projectVisionTitle')}</h3>
          <p className="about-pillar-text">
            {t('projectVisionText')}
          </p>
        </div>

        <div className="about-pillar-card">
          <h3 className="about-pillar-title about-pillar-title--purple">{t('workerPoolTitle')}</h3>
          <p className="about-pillar-text">
            {t('workerPoolText')}
          </p>
        </div>
      </div>

      {/* Tech Stack Pillars */}
      <div>
        <h2 className="about-tech-title">{t('techShowcaseTitle')}</h2>
        
        <div className="about-tech-list">
          
          {/* Go pillar */}
          <div className="about-tech-card">
            <div className="about-tech-badge about-tech-badge--go">Go</div>
            <div className="about-tech-body">
              <h4 className="about-tech-heading">{t('goPillarTitle')}</h4>
              <p className="about-tech-desc">
                {t('goPillarText')}
              </p>
            </div>
          </div>

          {/* React pillar */}
          <div className="about-tech-card">
            <div className="about-tech-badge about-tech-badge--react">JSX</div>
            <div className="about-tech-body">
              <h4 className="about-tech-heading">{t('reactPillarTitle')}</h4>
              <p className="about-tech-desc">
                {t('reactPillarText')}
              </p>
            </div>
          </div>

          {/* Database pillar */}
          <div className="about-tech-card">
            <div className="about-tech-badge about-tech-badge--sql">SQL</div>
            <div className="about-tech-body">
              <h4 className="about-tech-heading">{t('dbPillarTitle')}</h4>
              <p className="about-tech-desc">
                {t('dbPillarText')}
              </p>
            </div>
          </div>

          {/* Docker/Cloud pillar */}
          <div className="about-tech-card">
            <div className="about-tech-badge about-tech-badge--devops">📦</div>
            <div className="about-tech-body">
              <h4 className="about-tech-heading">{t('devopsPillarTitle')}</h4>
              <p className="about-tech-desc">
                {t('devopsPillarText')}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Footer message */}
      <div className="about-footer">
        {t('authorFooter')}
      </div>
      
    </div>
  );
}

export default AboutPage;
