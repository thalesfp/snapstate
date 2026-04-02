import { TodoStore } from "./features/todos/TodoStore";
import { AuthStore } from "./features/auth/AuthStore";
import { AccountStore } from "./features/account/AccountStore";
import { LoginFormStore } from "./features/auth/LoginFormStore";
import { TodoInputStore } from "./features/todos/TodoInputStore";
import { createUrlParams, syncToUrl } from "snapstate/url";

export const authStore = new AuthStore();
export const todoStore = new TodoStore(authStore);
export const accountStore = new AccountStore(authStore);
export const loginFormStore = new LoginFormStore(authStore);
export const todoInputStore = new TodoInputStore();
export const urlParams = createUrlParams<{ filter?: string }>();

syncToUrl(todoStore, {
  params: { filter: (s) => s.filter },
});

export type { Todo, Filter, User } from "./shared/types";
