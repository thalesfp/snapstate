import { describe, it, expect, beforeEach } from "vitest";
import { setHttpClient, type HttpClient } from "snapstate/react";
import { AuthStore } from "./AuthStore";

const VALID_EMAIL = "demo@example.com";
const VALID_PASSWORD = "Demo@2024!";
const MOCK_USER = { id: "1", email: VALID_EMAIL, name: "Demo User", notifications: true, theme: "system" as const };
const MOCK_TOKEN = "mock-jwt-token";

setHttpClient({
  request: (async (url: string, init?: { method?: string; body?: unknown }) => {
    if (url === "/api/auth/login" && init?.method === "POST") {
      const { email, password } = init.body as { email: string; password: string };
      if (email === VALID_EMAIL && password === VALID_PASSWORD) {
        return { token: MOCK_TOKEN, user: MOCK_USER };
      }
      throw new Error("Invalid credentials");
    }
  }) as HttpClient["request"],
});

describe("AuthStore", () => {
  let store: AuthStore;

  beforeEach(() => {
    store = new AuthStore();
  });

  it("starts unauthenticated", () => {
    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
  });

  describe("login", () => {
    it("sets token and user on success", async () => {
      await store.login(VALID_EMAIL, VALID_PASSWORD);
      expect(store.token).toBe(MOCK_TOKEN);
      expect(store.user).toEqual(MOCK_USER);
      expect(store.isAuthenticated).toBe(true);
    });

    it("sets error status on invalid credentials", async () => {
      try { await store.login("wrong@email.com", "wrong"); } catch {}
      expect(store.getStatus("login").status.isError).toBe(true);
      expect(store.getStatus("login").error).toBe("Invalid credentials");
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe("logout", () => {
    it("clears token and user", async () => {
      await store.login(VALID_EMAIL, VALID_PASSWORD);
      store.logout();
      expect(store.token).toBeNull();
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe("setUser", () => {
    it("updates the user", () => {
      store.setUser(MOCK_USER);
      expect(store.user).toEqual(MOCK_USER);
    });
  });

  describe("setToken", () => {
    it("updates the token", () => {
      store.setToken("new-token");
      expect(store.token).toBe("new-token");
      expect(store.isAuthenticated).toBe(true);
    });
  });
});
