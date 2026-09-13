import { useEffect } from 'react';

// Adds `is-visible` to every [data-reveal] element as it scrolls into view, so
// sections fade up instead of appearing all at once. Anything already on screen
// at load is revealed immediately, and the whole effect is skipped when the
// reader has asked for reduced motion.
// `ready` must be false until the content is actually on the page. The hook
// runs before the component's early returns, so without it the observer looks
// for elements during the loading render, finds none, and never runs again —
// leaving every section stuck at opacity 0.
export function useReveal(ready: boolean = true) {
  useEffect(() => {
    if (!ready) return;

    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (nodes.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ready]);
}
