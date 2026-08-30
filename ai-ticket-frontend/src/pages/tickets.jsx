import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../lib/api.js";

export default function Tickets() {
  const [form, setForm] = useState({ title: "", description: "" });
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "GET",
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(data.error || data.message || "Failed to fetch tickets");
        setTickets([]);
        return;
      }
      setTickets(Array.isArray(data) ? data : data.tickets || []);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        setForm({ title: "", description: "" });
        fetchTickets(); // Refresh list
      } else {
        alert(data.error || data.message || "Ticket creation failed");
      }
    } catch (err) {
      alert("Error creating ticket");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClassName = (status) => {
    if (status === "IN_PROGRESS") {
      return "status-pill status-progress";
    }
    if (status === "DONE") {
      return "status-pill status-done";
    }
    return "status-pill status-todo";
  };

  return (
    <main className="container-app page-enter py-8">
      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className="glass space-y-4 p-5">
          <div>
            <p className="eyebrow mb-1">Ticket Desk</p>
            <h2 className="heading text-3xl font-bold">Create Ticket</h2>
            <p className="mt-2 text-sm text-slate-300">
              Describe your issue clearly so assignment and AI triage stay accurate.
            </p>
          </div>

          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Ticket title"
            className="app-input"
            required
          />
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Ticket description"
            className="app-input min-h-36 resize-y"
            required
          />
          <button className="btn-accent px-5 py-2.5" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
        </form>

        <aside className="glass flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="eyebrow mb-1">Workflow</p>
            <h3 className="heading text-2xl font-bold">AI + Human Routing</h3>
            <p className="mt-2 text-sm text-slate-300">
              New tickets are analyzed, prioritized, then assigned to moderators based on skills.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">Total</p>
              <p className="heading mt-1 text-2xl font-bold">{tickets.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">Role</p>
              <p className="heading mt-1 text-2xl font-bold capitalize">
                {currentUser?.role || "user"}
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading text-2xl font-bold">All Tickets</h2>
          <span className="text-sm text-slate-400">{tickets.length} records</span>
        </div>

        <div className="space-y-3">
          {tickets.map((ticket) => {
            const status = ticket.status || "TODO";
            return (
              <Link
                key={ticket.ticketId || ticket._id}
                className="ticket-card"
                to={`/tickets/${ticket.ticketId || ticket._id}`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="heading text-xl font-bold">{ticket.title}</h3>
                  <span className={getStatusClassName(status)}>{status.replace("_", " ")}</span>
                </div>
                <p className="mb-3 text-sm text-slate-300">{ticket.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Created {new Date(ticket.createdAt).toLocaleString()}</span>
                  {ticket.assignedTo?.email ? <span>Assigned to {ticket.assignedTo.email}</span> : null}
                </div>
              </Link>
            );
          })}
          {tickets.length === 0 ? (
            <div className="glass p-4 text-sm text-slate-300">
              No tickets submitted yet. Create your first ticket above.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
