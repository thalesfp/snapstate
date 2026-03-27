export interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export type Filter = "all" | "active" | "completed";

export interface User {
  id: string;
  email: string;
  name: string;
  notifications: boolean;
  theme: "light" | "dark" | "system";
}
