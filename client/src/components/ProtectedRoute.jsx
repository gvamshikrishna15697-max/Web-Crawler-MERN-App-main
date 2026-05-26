import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, token, user } = useAuth();
  const location = useLocation();

  if (loading && !(token && user)) {
    return (
      <div className="authPage">
        <div className="authCard">
          <p className="authMuted">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
