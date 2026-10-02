import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../lib/api.js";

export default function Tickets() {
  const [form, setForm] = useState({ title: "", description: "" });
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [creationMessage, setCreationMessage] = useState("");

  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const role = currentUser?.role || "user";
  const ticketListTitle =
    role === "moderator" ? "Assigned Tickets" : role === "admin" ? "All Tickets" : "My Tickets";
  const emptyMessage =
    role === "moderator"
      ? "No tickets are assigned to you right now."
      : role === "admin"
        ? "No tickets have been submitted yet."
        : "No tickets submitted yet. Create your first ticket above.";

  const fetchTickets = useCallback(async () => {
    setListLoading(true);
    setListError("");

    try {
      const res = await fetch(`${API_BASE_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "GET",
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || data.message || "Failed to fetch tickets");
        setTickets([]);
        return;
      }
      setTickets(Array.isArray(data) ? data : data.tickets || []);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
      setListError("Unable to refresh tickets. Please try again.");
    } finally {
      setListLoading(false);
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
    setCreationMessage("");
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
        setCreationMessage(
          data.message || "Ticket created. AI analysis will continue in the background."
        );
        if (data.ticket) {
          setTickets((currentTickets) => [
            data.ticket,
            ...currentTickets.filter(
              (ticket) => (ticket.ticketId || ticket._id) !== (data.ticket.ticketId || data.ticket._id)
            ),
          ]);
        }
        await fetchTickets();
      } else {
        setCreationMessage(data.error || data.message || "Ticket creation failed");
      }
    } catch (err) {
      console.error("Error creating ticket", err);
      setCreationMessage("Unable to create the ticket. Please try again.");
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
          {creationMessage ? <p className="text-sm text-slate-300">{creationMessage}</p> : null}
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
              <p className="heading mt-1 text-2xl font-bold capitalize">{role}</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="heading text-2xl font-bold">{ticketListTitle}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">{tickets.length} records</span>
            <button
              type="button"
              className="btn-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={fetchTickets}
              disabled={listLoading}
            >
              {listLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {listError ? <p className="mb-3 text-sm text-rose-300">{listError}</p> : null}

        <div className="space-y-3">
          {tickets.map((ticket) => {
            const status = ticket.status || "TODO";
            const analysisPending = status === "TODO" && !ticket.priority;
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
                {analysisPending ? (
                  <p className="mb-3 text-sm text-slate-400">
                    AI analysis has not completed yet. Refresh to check for updates.
                  </p>
                ) : null}
                <div className="mb-3 flex flex-wrap gap-2">
                  {ticket.priority ? <span className="role-pill">{ticket.priority} priority</span> : null}
                  {ticket.relatedSkills?.map((skill) => (
                    <span key={skill} className="role-pill">
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Created {new Date(ticket.createdAt).toLocaleString()}</span>
                  {ticket.assignedTo?.email ? <span>Assigned to {ticket.assignedTo.email}</span> : null}
                </div>
              </Link>
            );
          })}
          {!listLoading && tickets.length === 0 ? (
            <div className="glass p-4 text-sm text-slate-300">{emptyMessage}</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
