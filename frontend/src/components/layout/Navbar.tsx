import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import './Navbar.css';

const links = [
  { to: '/', label: 'Discover' },
  { to: '/dashboard', label: 'My Sessions' },
  { to: '/profile', label: 'My Profile' }
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">Skill Swap</Link>

        <div className="navbar-actions">
          <span className="glass-pill credit-pill">
            <span className="credit-amount">{user?.creditBalance ?? 0}</span>
            <span>credits</span>
          </span>

          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `glass-pill nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={toggleTheme}
            className="glass-pill theme-switch"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="theme-switch-knob" aria-hidden="true" />
            <span className={`theme-switch-face${theme === 'light' ? ' selected' : ''}`}>Day</span>
            <span className={`theme-switch-face${theme === 'dark' ? ' selected' : ''}`}>Night</span>
          </button>

          <button type="button" onClick={logout} className="glass-pill">Logout</button>
        </div>
      </div>
    </nav>
  );
}
