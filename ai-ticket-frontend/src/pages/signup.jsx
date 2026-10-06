import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/api.js";

export default function SignupPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        navigate("/");
      } else {
        alert(data.error || data.message || "Signup failed");
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
          <p className="eyebrow mb-1">Get Started</p>
          <h2 className="heading text-3xl font-bold">Sign Up</h2>
          <p className="mt-2 text-sm text-slate-300">
            Create your account to submit tickets and collaborate with your team.
          </p>

          <form onSubmit={handleSignup} className="mt-5 space-y-3">
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
              {loading ? "Signing up..." : "Sign Up"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-300">
            Already have an account?{" "}
            <Link className="font-semibold text-cyan-300" to="/login">
              Login
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
