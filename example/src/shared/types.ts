export interface BaseTodo {
  id: string;
  text: string;
}

export interface ActiveTodo extends BaseTodo {
  completed: false;
}

export interface CompletedTodo extends BaseTodo {
  completed: true;
  completedAt: string;
}

export type Todo = ActiveTodo | CompletedTodo;

export interface Activity {
  id: string;
  action: string;
  timestamp: string;
}

export const FILTER_VALUES = ["all", "active", "completed"] as const;
export type Filter = (typeof FILTER_VALUES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  notifications: boolean;
  theme: "light" | "dark" | "system";
}
