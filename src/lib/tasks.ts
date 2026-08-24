import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

// Resolve the data file lazily so tests can point it at a temp location via
// the TASKS_DATA_FILE environment variable.
function dataFile(): string {
  return (
    process.env.TASKS_DATA_FILE ??
    path.join(process.cwd(), ".data", "tasks.json")
  );
}

async function readAll(): Promise<Task[]> {
  const file = dataFile();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch (err) {
    // A missing file simply means no tasks have been created yet.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(tasks: Task[]): Promise<void> {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(tasks, null, 2), "utf8");
}

export async function listTasks(): Promise<Task[]> {
  const tasks = await readAll();
  return [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addTask(title: string): Promise<Task> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Task title must not be empty");

  const task: Task = {
    id: randomUUID(),
    title: trimmed,
    done: false,
    createdAt: new Date().toISOString(),
  };

  const tasks = await readAll();
  tasks.push(task);
  await writeAll(tasks);
  return task;
}

export async function toggleTask(id: string): Promise<Task | null> {
  const tasks = await readAll();
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;

  task.done = !task.done;
  await writeAll(tasks);
  return task;
}

export async function deleteTask(id: string): Promise<boolean> {
  const tasks = await readAll();
  const next = tasks.filter((t) => t.id !== id);
  if (next.length === tasks.length) return false;

  await writeAll(next);
  return true;
}
