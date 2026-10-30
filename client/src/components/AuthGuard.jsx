import { Navigate } from "react-router-dom";

/**
 * Wraps protected routes — redirects to /login if no JWT in localStorage.
 */
export default function AuthGuard({ children }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
