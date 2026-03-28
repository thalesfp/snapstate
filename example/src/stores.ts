import { TodoStore } from "./features/todos/TodoStore";
import { TodoDetailStore } from "./features/todos/TodoDetailStore";
import { AuthStore } from "./features/auth/AuthStore";
import { AccountStore } from "./features/account/AccountStore";
import { LoginFormStore } from "./features/auth/LoginFormStore";
import { TodoInputStore } from "./features/todos/TodoInputStore";

export const authStore = new AuthStore();
export const todoStore = new TodoStore(authStore);
export const todoDetailStore = new TodoDetailStore();
export const accountStore = new AccountStore(authStore);
export const loginFormStore = new LoginFormStore(authStore);
export const todoInputStore = new TodoInputStore();
export type { Todo, Filter, User } from "./shared/types";
