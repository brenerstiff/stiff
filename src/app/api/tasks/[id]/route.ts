import { NextResponse } from "next/server";
import { deleteTask, toggleTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Context) {
  const { id } = await params;
  const task = await toggleTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const removed = await deleteTask(id);
  if (!removed) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
