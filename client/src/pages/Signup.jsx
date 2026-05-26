import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Signup() {
  const { signup, isAuthenticated, loading, setError } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  if (loading) {
    return (
      <div className="authPage">
        <div className="authCard">
          <p className="authMuted">Checking session…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setError("");
    setSubmitting(true);
    try {
      await signup({ username, password });
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err?.message || "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <h1 className="authTitle">Create account</h1>
        <p className="authMuted">
          Username: lowercase letters, numbers, underscore (3–32 chars).
        </p>

        <form className="authForm" onSubmit={handleSubmit}>
          <label className="authLabel">
            Username
            <input
              className="authInput"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              pattern="[a-z0-9_]{3,32}"
              required
            />
          </label>
          <label className="authLabel">
            Password
            <input
              className="authInput"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>

          {formError ? <div className="error">{formError}</div> : null}

          <button className="primary authSubmit" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="authFooter">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
