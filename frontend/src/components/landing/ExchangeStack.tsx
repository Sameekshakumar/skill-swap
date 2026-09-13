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

const N = CARDS.length;

// A rotating queue. The cards sit in a deck: one in front, the rest stacked
// behind it. Scrolling advances the queue — the front card lifts away and the
// one behind takes its place, while the card that left rejoins at the back.
// 1 → 2 → 3 → 1, so the order keeps cycling.
export default function ExchangeStack() {
  const section = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = window.matchMedia('(max-width: 900px)').matches;

    if (reduceMotion || narrow) {
      section.current?.classList.add('stack-static');
      return;
    }

    let raf = 0;
    let current = 0; // eased value that chases the scroll
    let target = 0;

    const readTarget = () => {
      const el = section.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / travel));
      target = progress * N;
    };

    const draw = () => {
      // Chase the scroll rather than tracking it exactly: following raw scroll
      // position 1:1 is what makes a pinned section feel stuck.
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.0005) current = target;

      cards.current.forEach((card, i) => {
        if (!card) return;

        // How far this card sits behind the front of the queue, wrapped so the
        // deck cycles instead of running out.
        let depth = (((i - current) % N) + N) % N;
        // Just past the front: treat it as leaving, so it lifts away instead of
        // jumping straight to the back of the deck.
        if (depth > N - 0.34) depth -= N;

        let x = 0;
        let y: number;
        let scale: number;
        let opacity: number;
        let rotate: number;

        if (depth < 0) {
          // Leaving. It slides out sideways rather than upward: up would take
          // it across the heading, and lingering on top of the incoming card
          // leaves two half-transparent cards muddled together. The fade is
          // deliberately quick so that overlap is brief.
          const out = Math.min(1, -depth / 0.34);
          x = -out * 110;
          y = -out * 16;
          scale = 1 - out * 0.04;
          opacity = Math.max(0, 1 - out * 2.1);
          rotate = -out * 2.5;
        } else {
          // Waiting in the deck, peeking out below the card in front. These
          // stay fully opaque: dimming them with opacity would make the card
          // itself see-through, and the text behind it would read straight
          // through the front card. The opaque background does the hiding.
          y = depth * 26;
          scale = 1 - depth * 0.05;
          opacity = 1;
          rotate = depth * 0.9;
        }

        card.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(Math.round(100 - depth * 10));
      });

      raf = requestAnimationFrame(draw);
    };

    readTarget();
    current = target;
    draw();

    window.addEventListener('scroll', readTarget, { passive: true });
    window.addEventListener('resize', readTarget);
    return () => {
      window.removeEventListener('scroll', readTarget);
      window.removeEventListener('resize', readTarget);
      cancelAnimationFrame(raf);
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
