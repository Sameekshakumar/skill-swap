import { useEffect, useRef } from 'react';

/**
 * Drifting colour blobs plus a glow that follows the cursor, sat behind the page
 * content so glass surfaces above have something to refract.
 *
 * Styling comes entirely from `styles/design-system.css`, so this carries no
 * dependencies of its own. Render it once near the root of each full-page
 * surface:
 *
 *     <div style={{ position: 'relative', minHeight: '100vh' }}>
 *       <AmbientBackground />
 *       ...page content...
 *     </div>
 *
 * The wrapper must NOT have an opaque background — the ambient layer sits at
 * z-index -10 and an opaque ancestor hides it completely. Let <body> paint the
 * base colour.
 *
 * Purely presentational: hidden from assistive tech, the drift stops under
 * `prefers-reduced-motion`, and the glow is skipped on pointers that cannot hover.
 */
export function AmbientBackground() {
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Touch pointers have no hover state, so the listener would only ever fire
    // on tap — not worth binding.
    if (!window.matchMedia('(hover: hover)').matches) return;

    let frame = 0;
    function onMove(event: PointerEvent) {
      // Coalesce to one write per frame: pointermove fires far faster than the
      // display refreshes, and each run only sets two custom properties.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = glow.current;
        if (!el) return;
        el.style.setProperty('--ss-x', `${event.clientX}px`);
        el.style.setProperty('--ss-y', `${event.clientY}px`);
        el.style.opacity = '1';
      });
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" className="ss-ambient">
      <div className="ss-blob ss-blob-a" />
      <div className="ss-blob ss-blob-b" />
      <div className="ss-blob ss-blob-c" />
      <div ref={glow} className="ss-cursor-glow" />
    </div>
  );
}
