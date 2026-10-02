import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../lib/api.js";

export default function TicketDetailsPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  const fetchTicket = useCallback(
    async ({ initial = false } = {}) => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setFetchError("");

      try {
        const res = await fetch(`${API_BASE_URL}/tickets/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (res.ok) {
          setTicket(data.ticket);
          return data.ticket;
        }

        setFetchError(data.error || data.message || "Failed to fetch ticket");
        if (initial) {
          setTicket(null);
        }
      } catch (err) {
        console.error("Failed to fetch ticket", err);
        setFetchError("Unable to refresh this ticket. Please try again.");
        if (initial) {
          setTicket(null);
        }
      } finally {
        if (initial) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }

      return null;
    },
    [id, token]
  );

  useEffect(() => {
    fetchTicket({ initial: true });
  }, [fetchTicket]);

  const assignedToId = ticket?.assignedTo?._id || ticket?.assignedTo;
  const canManageTicket =
    currentUser?.role === "admin" ||
    (currentUser?.role === "moderator" &&
      assignedToId &&
      String(assignedToId) === String(currentUser?._id));
  const nextStatus =
    ticket?.status === "TODO"
      ? "IN_PROGRESS"
      : ticket?.status === "IN_PROGRESS"
        ? "DONE"
        : null;
  const analysisPending =
    ticket?.status === "TODO" &&
    (!ticket?.priority || !ticket?.helpfulNotes || !ticket?.relatedSkills?.length);

  const updateStatus = async () => {
    if (!nextStatus || !canManageTicket) return;

    setUpdatingStatus(true);
    setStatusError("");

    try {
      const res = await fetch(`${API_BASE_URL}/tickets/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatusError(data.error || data.message || "Failed to update ticket status");
        return;
      }

      await fetchTicket();
    } catch (err) {
      console.error("Failed to update ticket status", err);
      setStatusError("Unable to update ticket status. Please try again.");
    } finally {
      setUpdatingStatus(false);
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

  const getPriorityClassName = (priority) => {
    if (priority === "high") {
      return "status-pill status-todo";
    }
    if (priority === "low") {
      return "status-pill status-done";
    }
    return "status-pill status-progress";
  };

  if (loading) {
    return (
      <div className="container-app py-12">
        <div className="glass flex items-center justify-center gap-3 p-8 text-slate-300">
          <span className="loader" />
          <span>Loading ticket details...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container-app py-12">
        <div className="glass p-8 text-center text-slate-300">
          {fetchError || "Ticket not found."}
        </div>
      </div>
    );
  }

  return (
    <main className="container-app page-enter py-8">
      <div className="glass space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="heading text-3xl font-bold">Ticket Details</h2>
          <div className="flex items-center gap-3">
            {ticket.status ? (
              <span className={getStatusClassName(ticket.status)}>
                {ticket.status.replace("_", " ")}
              </span>
            ) : null}
            <button
              type="button"
              className="btn-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => fetchTicket()}
              disabled={refreshing || updatingStatus}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {fetchError ? <p className="text-sm text-rose-300">{fetchError}</p> : null}

        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
          <h3 className="heading text-2xl font-bold">{ticket.title}</h3>
          <p className="mt-2 text-slate-200">{ticket.description}</p>
        </div>

        {analysisPending ? (
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
            AI analysis has not completed yet. Refresh this ticket to check for priority, skills,
            helpful notes, and assignment updates.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="eyebrow mb-1">Priority</p>
            {ticket.priority ? (
              <span className={getPriorityClassName(ticket.priority)}>{ticket.priority}</span>
            ) : (
              <p className="text-sm text-slate-400">Pending AI analysis</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="eyebrow mb-1">Assignment</p>
            <p className="font-semibold text-slate-100">
              {ticket.assignedTo?.email || "Not assigned yet"}
            </p>
          </div>
        </div>

        {canManageTicket && nextStatus ? (
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="eyebrow mb-2">Ticket Workflow</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                Move this ticket to {nextStatus.replace("_", " ")} when you are ready.
              </p>
              <button
                type="button"
                onClick={updateStatus}
                disabled={updatingStatus || refreshing}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingStatus
                  ? "Updating..."
                  : nextStatus === "DONE"
                    ? "Mark Done"
                    : "Start Work"}
              </button>
            </div>
            {statusError ? <p className="mt-3 text-sm text-rose-300">{statusError}</p> : null}
          </div>
        ) : null}

        {ticket.relatedSkills?.length ? (
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="eyebrow mb-2">Related Skills</p>
            <div className="flex flex-wrap gap-2">
              {ticket.relatedSkills.map((skill) => (
                <span key={skill} className="role-pill">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {ticket.helpfulNotes ? (
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="eyebrow mb-2">Helpful Notes</p>
            <div className="markdown-view">
              <ReactMarkdown>{ticket.helpfulNotes}</ReactMarkdown>
            </div>
          </div>
        ) : null}

        {ticket.createdAt ? (
          <p className="text-xs text-slate-400">
            Created at {new Date(ticket.createdAt).toLocaleString()}
          </p>
        ) : null}
      </div>
    </main>
  );
}
