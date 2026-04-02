export interface Todo {
  id: string;
  text: string;
  completed: boolean;
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
