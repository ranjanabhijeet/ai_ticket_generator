import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

export default function TicketDetailsPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  useEffect(() => {
    let shouldPoll = true;

    const fetchTicket = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/tickets/${id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await res.json();
        if (res.ok) {
          setTicket(data.ticket);
          return data.ticket;
        } else {
          alert(data.message || "Failed to fetch ticket");
        }
      } catch (err) {
        console.error(err);
        alert("Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    const pollTicket = async () => {
      if (!shouldPoll) return;

      const nextTicket = await fetchTicket();
      if (!shouldPoll) return;

      const analysisPending =
        nextTicket && (!nextTicket.priority || !nextTicket.helpfulNotes);

      if (analysisPending) {
        setTimeout(pollTicket, 3000);
      }
    };

    pollTicket();

    return () => {
      shouldPoll = false;
    };
  }, [id]);

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
        <div className="glass p-8 text-center text-slate-300">Ticket not found.</div>
      </div>
    );
  }

  return (
    <main className="container-app page-enter py-8">
      <div className="glass space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="heading text-3xl font-bold">Ticket Details</h2>
          {ticket.status ? (
            <span className={getStatusClassName(ticket.status)}>
              {ticket.status.replace("_", " ")}
            </span>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
          <h3 className="heading text-2xl font-bold">{ticket.title}</h3>
          <p className="mt-2 text-slate-200">{ticket.description}</p>
        </div>

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
