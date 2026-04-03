import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import jwt from "jsonwebtoken";

const JWT_SECRET = "snapstate-demo-secret";
const TOKEN_EXPIRY = "1h";

interface User {
  id: string;
  email: string;
  name: string;
  notifications: boolean;
  theme: string;
}

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

const DEFAULT_DEMO_USERS: Array<User & { password: string }> = [
  { id: "1", email: "demo@example.com", name: "Demo User", notifications: true, theme: "system", password: "Demo@2024!" },
];

const DEMO_USERS: Array<User & { password: string }> = DEFAULT_DEMO_USERS.map((u) => ({ ...u }));

const initialTodos: Todo[] = [
  { id: "1", text: "Learn snapstate", completed: true, completedAt: "2024-12-01T10:00:00Z", createdAt: "2024-12-01T09:00:00Z" },
  { id: "2", text: "Build a todo app", completed: false, createdAt: "2024-12-01T09:30:00Z" },
  { id: "3", text: "Add fetch support", completed: false, createdAt: "2024-12-01T09:45:00Z" },
];

const todosByUser = new Map<string, { todos: Todo[]; nextId: number }>();

function getUserTodos(userId: string) {
  if (!todosByUser.has(userId)) {
    todosByUser.set(userId, {
      todos: initialTodos.map((t) => ({ ...t })),
      nextId: 4,
    });
  }
  return todosByUser.get(userId)!;
}

function verifyToken(header: string | undefined): User | null {
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as User;
    return { id: payload.id, email: payload.email, name: payload.name, notifications: payload.notifications, theme: payload.theme };
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const app = new Hono();

app.use("*", cors());

// --- Auth routes ---

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = DEMO_USERS.find((u) => u.email === email && u.password === password);
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const userData = { id: user.id, email: user.email, name: user.name, notifications: user.notifications, theme: user.theme };
  const token = jwt.sign(userData, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  return c.json({ token, user: userData });
});

app.get("/api/auth/me", (c) => {
  const user = verifyToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(user);
});

// --- Reset (test-only, no auth) ---

app.post("/api/todos/reset", (c) => {
  todosByUser.clear();
  return c.json({ ok: true });
});

app.post("/api/account/reset", (c) => {
  DEMO_USERS.length = 0;
  DEMO_USERS.push(...DEFAULT_DEMO_USERS.map((u) => ({ ...u })));
  return c.json({ ok: true });
});

// --- Auth middleware for /api/account/* ---

app.use("/api/account/profile", async (c, next) => {
  const user = verifyToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user" as never, user as never);
  await next();
});

app.patch("/api/account/profile", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const { name, email, notifications, theme } = await c.req.json();
  const entry = DEMO_USERS.find((u) => u.id === user.id);
  if (!entry) return c.json({ error: "User not found" }, 404);

  if (name) entry.name = name;
  if (email) entry.email = email;
  if (typeof notifications === "boolean") entry.notifications = notifications;
  if (theme) entry.theme = theme;

  const updated = { id: entry.id, email: entry.email, name: entry.name, notifications: entry.notifications, theme: entry.theme };
  const token = jwt.sign(updated, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  await delay(300);
  return c.json({ token, user: updated });
});

// --- Auth middleware for /api/todos/* ---

app.use("/api/todos/*", async (c, next) => {
  const user = verifyToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user" as never, user as never);
  await next();
});

app.use("/api/todos", async (c, next) => {
  const user = verifyToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user" as never, user as never);
  await next();
});

// --- Todo routes ---

app.get("/api/todos/:id", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const id = c.req.param("id");
  const data = getUserTodos(user.id);
  const todo = data.todos.find((t) => t.id === id);
  if (!todo) { return c.json({ error: "Not found" }, 404); }
  await delay(300);
  return c.json(todo);
});

app.get("/api/todos/:id/activity", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const id = c.req.param("id");
  const data = getUserTodos(user.id);
  const todo = data.todos.find((t) => t.id === id);
  if (!todo) { return c.json({ error: "Not found" }, 404); }
  await delay(200);
  const activity = [
    { id: "1", action: "Created", timestamp: todo.createdAt },
    ...(todo.completed ? [{ id: "2", action: "Completed", timestamp: todo.completedAt ?? new Date().toISOString() }] : []),
  ];
  return c.json(activity);
});

app.get("/api/todos", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const data = getUserTodos(user.id);
  await delay(500);
  return c.json(data.todos);
});

app.post("/api/todos", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const { text } = await c.req.json();
  const data = getUserTodos(user.id);
  const todo: Todo = { id: String(data.nextId++), text, completed: false, createdAt: new Date().toISOString() };
  data.todos.push(todo);
  await delay(300);
  return c.json(todo);
});

app.patch("/api/todos/:id", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const id = c.req.param("id");
  const updates = await c.req.json();
  const data = getUserTodos(user.id);
  const todo = data.todos.find((t) => t.id === id);
  if (!todo) return c.json({ error: "Not found" }, 404);

  Object.assign(todo, updates);
  if (typeof updates.completed === "boolean") {
    todo.completedAt = updates.completed ? new Date().toISOString() : undefined;
  }

  await delay(300);
  return c.json(todo);
});

app.delete("/api/todos/:id", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const id = c.req.param("id");
  const data = getUserTodos(user.id);
  const idx = data.todos.findIndex((t) => t.id === id);
  if (idx === -1) return c.json({ error: "Not found" }, 404);
  data.todos.splice(idx, 1);
  await delay(300);
  return c.body(null, 204);
});

app.post("/api/todos/clear-completed", async (c) => {
  const user = c.get("user" as never) as unknown as User;
  const data = getUserTodos(user.id);
  const before = data.todos.length;
  data.todos = data.todos.filter((t) => !t.completed);
  await delay(300);
  return c.json({ deleted: before - data.todos.length });
});

console.log("Mock API server running on http://localhost:3001");
serve({ fetch: app.fetch, port: 3001 });
