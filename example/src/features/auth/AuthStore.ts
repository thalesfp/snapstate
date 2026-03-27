import { SnapStore } from "snapstate/react";
import type { User } from "../../shared/types";

type AuthOp = "login";

interface AuthState {
  user: User | null;
  token: string | null;
}

export class AuthStore extends SnapStore<AuthState, AuthOp> {
  constructor() {
    super({ user: null, token: null });
  }

  get isAuthenticated(): boolean {
    return this.state.get("token") !== null;
  }

  get user(): User | null {
    return this.state.get("user");
  }

  get token(): string | null {
    return this.state.get("token");
  }

  login(email: string, password: string) {
    return this.api.post<{ token: string; user: User }>("login", "/api/auth/login", {
      body: { email, password },
      onSuccess: (data) => {
        this.state.set("token", data.token);
        this.state.set("user", data.user);
      },
    });
  }

  logout() {
    this.state.set("token", null);
    this.state.set("user", null);
  }

  setUser(user: User) {
    this.state.set("user", user);
  }

  setToken(token: string) {
    this.state.set("token", token);
  }
}
