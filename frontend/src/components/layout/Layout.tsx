import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { AmbientBackground } from './AmbientBackground';

// Every signed-in page renders inside this, so the navigation bar is identical
// on all of them rather than each page drawing its own.
export default function Layout() {
  return (
    <div className="app-frame">
      <AmbientBackground />
      <Navbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
