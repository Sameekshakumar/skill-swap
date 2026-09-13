import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useReveal } from '../hooks/useReveal';
import { AmbientBackground } from '../components/layout/AmbientBackground';
import nightModeIcon from '../assets/night-mode.png';
import './LandingPage.css';

const STEPS = [
  {
    n: '01',
    title: 'List what you can teach',
    body: 'Add a skill, its level, and what an hour of it is worth — one, two or three credits. Add the things you want to learn too, so people know what to offer you.'
  },
  {
    n: '02',
    title: 'Request a session',
    body: 'Browse what other students teach and ask for a time. Your credits are set aside the moment you ask, so nobody can book what they cannot pay for.'
  },
  {
    n: '03',
    title: 'Both confirm, credits move',
    body: 'After the session you each mark it done. Only when both of you agree do the credits reach the teacher — then you rate each other.'
  }
];

const RULES = [
  { label: 'Everyone starts with', value: '10', unit: 'credits' },
  { label: 'An hour of teaching earns', value: '1–3', unit: 'credits' },
  { label: 'Cancelled or declined', value: '100%', unit: 'refunded' }
];

export default function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  useReveal(!loading && !isAuthenticated);

  // Signed-in visitors have no use for the pitch.
  if (loading) return <div className="landing" />;
  if (isAuthenticated) return <Navigate to="/discover" replace />;

  return (
    <div className="landing">
      <AmbientBackground />

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <span className="landing-brand-name">Skill Swap</span>
            <span className="landing-brand-sub">Teach an hour, learn an hour</span>
          </div>

          <div className="landing-nav-actions">
            <button
              type="button"
              onClick={toggleTheme}
              className="landing-icon-btn"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-pressed={theme === 'dark'}
            >
              <span
                className="ss-icon landing-toggle-icon"
                style={{ ['--ss-icon-src' as string]: `url(${nightModeIcon})` }}
                aria-hidden="true"
              />
            </button>
            <Link to="/login" className="landing-cta landing-cta-solid">Log in</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="landing-hero">
          <div className="landing-shell landing-hero-grid">
            <div className="landing-hero-copy" data-reveal>
              <h1 className="landing-title">
                <span>Trade what you know</span>
                <em>for what you want</em>
                <span>to learn</span>
              </h1>
              <p className="landing-lede">
                Skill Swap is a credit-based exchange for students. An hour of teaching earns
                credits; an hour of learning spends them. No money changes hands, and nobody
                can take a lesson they have not earned.
              </p>
              <div className="landing-actions">
                <Link to="/login" className="landing-cta landing-cta-solid">
                  Get started with Google
                </Link>
                <a href="#how" className="landing-cta landing-cta-ghost">How it works</a>
              </div>
            </div>

            <div className="landing-panel" data-reveal>
              <div className="landing-panel-head">
                <span>One exchange</span>
                <span className="landing-dots" aria-hidden="true"><i /><i /><i /></span>
              </div>
              <ol className="landing-flow">
                <li>
                  <span className="landing-flow-badge">01</span>
                  <div>
                    <h3>Ravi asks Asha for guitar</h3>
                    <p>2 credits/hour × 2 hours — 4 credits set aside</p>
                  </div>
                </li>
                <li>
                  <span className="landing-flow-badge">02</span>
                  <div>
                    <h3>Asha accepts</h3>
                    <p>The session is confirmed and shows in both calendars</p>
                  </div>
                </li>
                <li>
                  <span className="landing-flow-badge">03</span>
                  <div>
                    <h3>Both mark it complete</h3>
                    <p>4 credits move to Asha. Ravi can now teach to earn them back</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="landing-section" id="how">
          <div className="landing-shell">
            <div className="landing-section-head" data-reveal>
              <span className="landing-eyebrow">How it works</span>
              <h2 className="landing-h2">
                Three steps, <em>no money</em>
              </h2>
              <p className="landing-section-lede">
                Every exchange follows the same path, and the credits only move when both
                people say the session actually happened.
              </p>
            </div>

            <div className="landing-steps">
              {STEPS.map((step, i) => (
                <article className="landing-step" key={step.n} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                  <span className="landing-step-n">{step.n}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Credits */}
        <section className="landing-section landing-section-alt">
          <div className="landing-shell">
            <div className="landing-section-head" data-reveal>
              <span className="landing-eyebrow">The credit system</span>
              <h2 className="landing-h2">
                One hour in, <em>one hour out</em>
              </h2>
              <p className="landing-section-lede">
                Credits are the whole economy. They are not bought and they cannot be
                conjured — the only way to earn them is to teach somebody something.
              </p>
            </div>

            <div className="landing-rules" data-reveal>
              {RULES.map((rule) => (
                <div className="landing-rule" key={rule.label}>
                  <p className="landing-rule-label">{rule.label}</p>
                  <p className="landing-rule-value">
                    {rule.value} <span>{rule.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            <p className="landing-note" data-reveal>
              Credits are held, not spent, while a request is pending. Decline a request or
              cancel a session and they go straight back — so an unanswered request never
              costs anybody anything.
            </p>
          </div>
        </section>

        {/* Closing */}
        <section className="landing-section landing-closing">
          <div className="landing-shell" data-reveal>
            <h2 className="landing-h2 landing-closing-title">
              Everyone knows <em>something</em>
            </h2>
            <p className="landing-section-lede">
              Sign in with your Google account, add one skill, and you are part of it.
            </p>
            <Link to="/login" className="landing-cta landing-cta-solid landing-cta-large">
              Get started
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-shell">
          <span>Skill Swap</span>
          <span>A student skill exchange</span>
        </div>
      </footer>
    </div>
  );
}
