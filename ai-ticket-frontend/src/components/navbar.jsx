import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const token = localStorage.getItem("token");
  let user = localStorage.getItem("user");
  if (user) {
    user = JSON.parse(user);
  }
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/55 backdrop-blur-xl">
      <div className="container-app flex items-center justify-between py-3">
        <Link to="/" className="heading flex items-center gap-2 text-2xl font-bold">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]" />
          Ticket AI
        </Link>

        <div className="flex items-center gap-2 text-sm">
          {!token ? (
            <>
              <Link to="/signup" className="btn-muted px-3 py-2">
                Signup
              </Link>
              <Link to="/login" className="btn-accent px-3 py-2">
                Login
              </Link>
            </>
          ) : (
            <>
              <p className="hidden text-slate-300 sm:inline">
                Hi, <span className="font-semibold text-slate-100">{user?.email}</span>
              </p>
              {user?.role ? <span className="role-pill">{user.role}</span> : null}
              {user?.role === "admin" ? (
                <Link to="/admin" className="btn-muted px-3 py-2">
                  Admin
                </Link>
              ) : null}
              <button onClick={logout} className="btn-muted px-3 py-2">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
