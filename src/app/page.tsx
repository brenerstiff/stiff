"use client";

import { useEffect, useMemo, useState } from "react";

interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = useMemo(
    () => tasks.filter((t) => !t.done).length,
    [tasks],
  );

  async function refresh() {
    const res = await fetch("/api/tasks", { cache: "no-store" });
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/tasks", { cache: "no-store" });
        const data = await res.json();
        if (active) setTasks(data.tasks ?? []);
      } catch {
        if (active) setError("Could not load tasks");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value }),
      });
      if (!res.ok) throw new Error("request failed");
      setTitle("");
      await refresh();
    } catch {
      setError("Could not add task");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
    await fetch(`/api/tasks/${id}`, { method: "PATCH" }).catch(() => refresh());
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" }).catch(() => refresh());
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-600/30">
            S
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Stiff Tasks</h1>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          A tiny task manager used to verify the Cloud Agent development
          environment end to end.
        </p>
      </header>

      <form onSubmit={handleAdd} className="flex gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a new task…"
          aria-label="New task title"
          className="flex-1 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/10 dark:bg-white/[0.03]"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
          <span>Tasks</span>
          <span data-testid="remaining">{remaining} remaining</span>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-black/40 dark:text-white/40">
            Loading…
          </p>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/10 py-10 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
            No tasks yet. Add your first one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              // Key includes the list length so surviving rows remount on a
              // structural change (add/delete). This works around a Chromium
              // text-decoration paint-invalidation bug where a reused node's
              // strikethrough is not repainted after a preceding sibling is
              // removed and the node is relocated.
              <li
                key={`${tasks.length}:${task.id}`}
                className="group flex items-center gap-3 rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 transition hover:border-black/10 dark:border-white/5 dark:bg-white/[0.03] dark:hover:border-white/10"
              >
                <button
                  onClick={() => toggle(task.id)}
                  aria-label={task.done ? "Mark as not done" : "Mark as done"}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                    task.done
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-black/20 dark:border-white/25"
                  }`}
                >
                  {task.done && (
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    task.done
                      ? "text-black/40 line-through dark:text-white/40"
                      : ""
                  }`}
                >
                  {task.title}
                </span>
                <button
                  onClick={() => remove(task.id)}
                  aria-label="Delete task"
                  className="text-black/30 opacity-60 transition hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 dark:text-white/30"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                    <path d="M8 2a1 1 0 00-1 1v1H4a1 1 0 000 2h12a1 1 0 100-2h-3V3a1 1 0 00-1-1H8zM5 8h10l-.8 9a1 1 0 01-1 .9H6.8a1 1 0 01-1-.9L5 8z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
