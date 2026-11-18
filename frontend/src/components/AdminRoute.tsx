import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

// Sits inside ProtectedRoute, so by this point the session has been restored
// and the visitor is signed in — only the role is still in question.
//
// This hides the page; it does not secure it. Every /api/admin route checks
// the role again server side against the database, which is the check that
// actually counts.
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { loading, user } = useAuth();

  if (loading) {
    return null;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/discover" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
