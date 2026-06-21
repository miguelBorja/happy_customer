export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export const initGA = () => {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) return;

  // Prevent multiple injections
  if (document.getElementById('google-tag-manager-script')) return;

  // Google Tag (gtag.js) script
  const script = document.createElement('script');
  script.id = 'google-tag-manager-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());

  // Configure GA4 with manual page view option
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false, // We handle pageviews manually in React
  });
};

export const trackPageView = (pagePath, pageTitle) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_title: pageTitle,
      send_to: GA_MEASUREMENT_ID,
    });
  }
};

export const trackEvent = (action, category, label = '', value = 0) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
      send_to: GA_MEASUREMENT_ID,
    });
  }
};
