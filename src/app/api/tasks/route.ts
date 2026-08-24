import { NextResponse } from "next/server";
import { addTask, listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body as { title?: unknown })?.title;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json(
      { error: "A non-empty 'title' is required" },
      { status: 400 },
    );
  }

  const task = await addTask(title);
  return NextResponse.json({ task }, { status: 201 });
}
