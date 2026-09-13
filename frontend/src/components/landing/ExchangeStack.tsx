import { useEffect, useRef } from 'react';
import './ExchangeStack.css';

const CARDS = [
  {
    n: '01',
    title: 'Sameeksha asks Sanjana for guitar',
    body: '2 credits an hour, booked for two hours. Four of Sameeksha’s credits are set aside the moment she asks.'
  },
  {
    n: '02',
    title: 'Sanjana accepts',
    body: 'The session is confirmed. Had she declined, the four credits would have gone straight back.'
  },
  {
    n: '03',
    title: 'Both mark it complete',
    body: 'Only once they both confirm do the four credits reach Sanjana — who can now spend them learning something else.'
  }
];

// The cards start stacked exactly on top of one another, so only the front one
// is readable. Scrolling fans the ones behind it out like a hand of cards.
//
// Progress is taken from how far the tall outer section has travelled past the
// sticky viewport, so the animation is driven by scroll position rather than
// time — scroll back up and it closes again.
export default function ExchangeStack() {
  const section = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = window.matchMedia('(max-width: 900px)').matches;

    if (reduceMotion || narrow) {
      // No stacking: the cards simply sit in a list and are all readable.
      section.current?.classList.add('stack-static');
      return;
    }

    let frame = 0;

    const apply = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / travel));

      cards.current.forEach((card, i) => {
        if (!card) return;

        // The front card never moves; each one behind it gets its own slice of
        // the scroll to swing out into.
        // The last card finishes around three quarters of the way through, so
        // the full fan is readable for a moment before the section releases.
        const start = i === 0 ? 0 : 0.08 + (i - 1) * 0.3;
        const t = i === 0 ? 1 : Math.min(1, Math.max(0, (progress - start) / 0.34));
        const eased = t * t * (3 - 2 * t);

        // The rotation is the reveal, not the resting state: a card starts
        // tucked behind the one in front at an angle, then swings flat as it
        // slides out. Leaving it tilted would mean reading text on a slant.
        const lift = eased * i * 162;
        const angle = (1 - eased) * -9;
        const scale = 1 - (1 - eased) * 0.07;

        card.style.transform = `translate3d(0, ${lift}px, 0) rotate(${angle}deg) scale(${scale})`;
        card.style.opacity = String(i === 0 ? 1 : 0.25 + eased * 0.75);
        card.style.zIndex = String(10 - i);
      });
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="stack-section" ref={section}>
      <div className="stack-sticky">
        <div className="landing-shell">
          <div className="stack-head">
            <span className="landing-eyebrow">One exchange</span>
            <h2 className="landing-h2">
              What a single swap <em>looks like</em>
            </h2>
          </div>

          <div className="stack-cards">
            {CARDS.map((card, i) => (
              <article
                className="stack-card"
                key={card.n}
                ref={(node) => { cards.current[i] = node; }}
              >
                <span className="stack-card-n">{card.n}</span>
                <div className="stack-card-copy">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
