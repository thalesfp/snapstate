import { SnapStore } from "snapstate/react";
import type { User } from "../../shared/types";

type AuthOp = "login" | "restore";

interface AuthState {
  user: User | null;
  token: string | null;
}

const TOKEN_KEY = "snapstate_token";

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
    return this.api.post<{ token: string; user: User }>({
      key: "login",
      url: "/api/auth/login",
      body: { email, password },
      onSuccess: (data) => {
        localStorage.setItem(TOKEN_KEY, data.token);
        this.state.merge({ token: data.token, user: data.user });
      },
    });
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.state.reset();
  }

  async restore() {
    const token = localStorage.getItem(TOKEN_KEY);
    
    if (!token) {
      return;
    }

    this.state.set("token", token);

    try {
      await this.api.get({ key: "restore", url: "/api/auth/me", target: "user" });
    } catch {
      this.logout();
    }
  }

  setUser(user: User) {
    this.state.set("user", user);
  }

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    this.state.set("token", token);
  }
}
