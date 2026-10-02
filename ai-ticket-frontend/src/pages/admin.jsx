import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api.js";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ role: "", skills: [] });
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const currentUserRole = currentUser?.role;

  const getRoleClassName = (role) => {
    if (role === "admin") {
      return "status-pill status-progress";
    }
    if (role === "moderator") {
      return "status-pill status-done";
    }
    return "status-pill status-todo";
  };

  const fetchUsers = useCallback(async () => {
    if (currentUserRole !== "admin") {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data);
        setFilteredUsers(data);
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error("Error fetching users", err);
    }
  }, [currentUserRole, token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (currentUserRole !== "admin") {
    return (
      <main className="container-app py-8">
        <div className="glass page-enter p-8">
          <h1 className="heading mb-2 text-3xl font-bold">Admin Access Required</h1>
          <p className="text-slate-300">
            You are logged in as a non-admin account.
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Use an admin account to manage users and skills.
          </p>
        </div>
      </main>
    );
  }

  const handleEditClick = (user) => {
    setEditingUser(user.email);
    setFormData({
      role: user.role,
      skills: user.skills || [],
    });
    setSkillInput("");
  };

  const normalizeSkill = (skill) => skill.trim().replace(/\s+/g, " ");

  const addSkills = () => {
    const additions = skillInput
      .split(",")
      .map(normalizeSkill)
      .filter(Boolean);

    if (!additions.length) {
      return;
    }

    const seenSkills = new Set(formData.skills.map((skill) => skill.toLowerCase()));
    const uniqueAdditions = additions.filter((skill) => {
      const key = skill.toLowerCase();
      if (seenSkills.has(key)) {
        return false;
      }

      seenSkills.add(key);
      return true;
    });

    setFormData({ ...formData, skills: [...formData.skills, ...uniqueAdditions] });
    setSkillInput("");
  };

  const removeSkill = (skillToRemove) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter((skill) => skill !== skillToRemove),
    });
  };

  const handleUpdate = async () => {
    setSaving(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/update-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: editingUser,
            role: formData.role,
            skills: formData.skills,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        console.error(data.error || "Failed to update user");
        return;
      }

      setEditingUser(null);
      setFormData({ role: "", skills: [] });
      setSkillInput("");
      fetchUsers();
    } catch (err) {
      console.error("Update failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    setFilteredUsers(
      users.filter((user) => user.email.toLowerCase().includes(query))
    );
  };

  return (
    <main className="container-app page-enter py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="heading text-3xl font-bold">Manage Users</h1>
        </div>
        <span className="text-sm text-slate-300">{filteredUsers.length} users</span>
      </div>

      <div className="glass mb-5 p-4">
        <input
          type="text"
          className="app-input"
          placeholder="Search by email"
          value={searchQuery}
          onChange={handleSearch}
        />
      </div>

      <div className="space-y-4">
        {filteredUsers.map((user) => (
          <section key={user._id} className="glass p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-slate-100">{user.email}</p>
              <span className={getRoleClassName(user.role)}>{user.role}</span>
            </div>

            <p className="mb-2 text-sm text-slate-300">
              Skills:{" "}
              {user.skills && user.skills.length > 0 ? user.skills.join(", ") : "N/A"}
            </p>

            {editingUser === user.email ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-200">
                  Role
                  <select
                    className="app-input mt-1"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <div>
                  <p className="mb-2 text-sm font-medium text-slate-200">Skills</p>
                  {formData.skills.length ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {formData.skills.map((skill) => (
                        <span key={skill} className="role-pill flex items-center gap-2">
                          {skill}
                          <button
                            type="button"
                            className="text-xs font-semibold text-cyan-100 hover:text-white"
                            onClick={() => removeSkill(skill)}
                          >
                            Remove
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-sm text-slate-400">No skills assigned.</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Add skill, or comma-separated skills"
                      className="app-input min-w-0 flex-1"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkills();
                        }
                      }}
                    />
                    <button type="button" className="btn-muted px-4 py-2" onClick={addSkills}>
                      Add Skill
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="btn-accent px-4 py-2"
                    onClick={handleUpdate}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn-muted px-4 py-2"
                    onClick={() => {
                      setEditingUser(null);
                      setSkillInput("");
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-muted px-4 py-2"
                onClick={() => handleEditClick(user)}
              >
                Edit User
              </button>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
