import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/api.js";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        navigate("/");
      } else {
        alert(data.error || data.message || "Login failed");
      }
    } catch (err) {
      alert("Something went wrong");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container-app page-enter py-12">
      <div className="mx-auto max-w-md">
        <div className="glass p-6">
          <p className="eyebrow mb-1">Welcome Back</p>
          <h2 className="heading text-3xl font-bold">Login</h2>
          <p className="mt-2 text-sm text-slate-300">
            Access your ticket dashboard and assigned work queue.
          </p>

          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <input
              type="email"
              name="email"
              placeholder="Email"
              className="app-input"
              value={form.email}
              onChange={handleChange}
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              className="app-input"
              value={form.password}
              onChange={handleChange}
              required
            />

            <button
              type="submit"
              className="btn-accent w-full px-4 py-2.5"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-300">
            New here?{" "}
            <Link className="font-semibold text-cyan-300" to="/signup">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
