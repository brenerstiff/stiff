import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { addTask, deleteTask, listTasks, toggleTask } from "./tasks";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stiff-tasks-"));
  process.env.TASKS_DATA_FILE = path.join(tmpDir, "tasks.json");
});

afterEach(async () => {
  delete process.env.TASKS_DATA_FILE;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("tasks storage", () => {
  it("starts empty", async () => {
    expect(await listTasks()).toEqual([]);
  });

  it("adds a task and persists it", async () => {
    const created = await addTask("Write docs");
    expect(created.title).toBe("Write docs");
    expect(created.done).toBe(false);

    const tasks = await listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(created.id);
  });

  it("trims titles and rejects empty ones", async () => {
    const created = await addTask("  spaced  ");
    expect(created.title).toBe("spaced");
    await expect(addTask("   ")).rejects.toThrow(/must not be empty/);
  });

  it("toggles completion state", async () => {
    const created = await addTask("Toggle me");
    const toggled = await toggleTask(created.id);
    expect(toggled?.done).toBe(true);

    const back = await toggleTask(created.id);
    expect(back?.done).toBe(false);
    expect(await toggleTask("missing")).toBeNull();
  });

  it("deletes tasks", async () => {
    const created = await addTask("Delete me");
    expect(await deleteTask(created.id)).toBe(true);
    expect(await listTasks()).toHaveLength(0);
    expect(await deleteTask(created.id)).toBe(false);
  });

  it("returns newest tasks first", async () => {
    await addTask("first");
    await new Promise((r) => setTimeout(r, 5));
    await addTask("second");

    const tasks = await listTasks();
    expect(tasks.map((t) => t.title)).toEqual(["second", "first"]);
  });
});
