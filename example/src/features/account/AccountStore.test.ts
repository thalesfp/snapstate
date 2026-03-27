import { describe, it, expect, beforeEach } from "vitest";
import { setHttpClient, type HttpClient } from "snapstate/form";
import { AuthStore } from "../auth/AuthStore";
import { AccountStore } from "./AccountStore";

const UPDATED_USER = { id: "1", email: "new@example.com", name: "New Name", notifications: false, theme: "dark" };
const UPDATED_TOKEN = "updated-jwt-token";

setHttpClient({
  request: (async (url: string, init?: { method?: string; body?: unknown }) => {
    if (url === "/api/account/profile" && init?.method === "PATCH") {
      const { name, email, notifications, theme } = init.body as {
        name: string; email: string; notifications: boolean; theme: string;
      };
      return {
        token: UPDATED_TOKEN,
        user: { id: "1", email, name, notifications, theme },
      };
    }
  }) as HttpClient["request"],
});

describe("AccountStore", () => {
  let authStore: AuthStore;
  let store: AccountStore;

  beforeEach(() => {
    authStore = new AuthStore();
    store = new AccountStore(authStore);
  });

  it("starts with default values", () => {
    expect(store.values.name).toBe("");
    expect(store.values.email).toBe("");
    expect(store.values.notifications).toBe(false);
    expect(store.values.theme).toBe("system");
  });

  describe("loadProfile", () => {
    it("sets values and initial from user", () => {
      store.loadProfile({ id: "1", name: "Demo User", email: "demo@example.com", notifications: true, theme: "system" });
      expect(store.values.name).toBe("Demo User");
      expect(store.values.email).toBe("demo@example.com");
      expect(store.values.notifications).toBe(true);
      expect(store.values.theme).toBe("system");
      expect(store.isDirty).toBe(false);
    });
  });

  describe("setValue", () => {
    it("updates value without affecting initial", () => {
      store.loadProfile({ id: "1", name: "Demo User", email: "demo@example.com", notifications: true, theme: "system" });
      store.setValue("name", "New Name");
      store.setValue("email", "new@example.com");
      expect(store.values.name).toBe("New Name");
      expect(store.values.email).toBe("new@example.com");
      expect(store.isDirty).toBe(true);
    });

    it("updates boolean and enum fields", () => {
      store.loadProfile({ id: "1", name: "Demo User", email: "demo@example.com", notifications: true, theme: "system" });
      store.setValue("notifications", false);
      store.setValue("theme", "dark");
      expect(store.values.notifications).toBe(false);
      expect(store.values.theme).toBe("dark");
      expect(store.isDirty).toBe(true);
    });
  });

  describe("validation", () => {
    it("validates on blur (onBlur mode)", () => {
      store.setValue("email", "bad");
      expect(store.errors.email).toBeUndefined();
      store.handleBlur("email");
      expect(store.errors.email).toBeDefined();
    });

    it("validate() returns null for invalid data", () => {
      expect(store.validate()).toBeNull();
      expect(store.errors.name).toBeDefined();
      expect(store.errors.email).toBeDefined();
    });

    it("validate() returns data for valid input", () => {
      store.setValue("name", "John");
      store.setValue("email", "john@example.com");
      const data = store.validate();
      expect(data).toEqual({ name: "John", email: "john@example.com", notifications: false, theme: "system" });
    });
  });

  describe("updateProfile", () => {
    it("does not call API when validation fails", () => {
      const result = store.updateProfile();
      expect(result).toBeUndefined();
    });

    it("updates values on success", async () => {
      store.setValue("name", "New Name");
      store.setValue("email", "new@example.com");
      store.setValue("notifications", false);
      store.setValue("theme", "dark");
      await store.updateProfile();
      expect(store.values.name).toBe("New Name");
      expect(store.values.email).toBe("new@example.com");
      expect(store.values.notifications).toBe(false);
      expect(store.values.theme).toBe("dark");
      expect(store.isDirty).toBe(false);
    });

    it("updates auth store user and token on success", async () => {
      store.setValue("name", "New Name");
      store.setValue("email", "new@example.com");
      store.setValue("notifications", false);
      store.setValue("theme", "dark");
      await store.updateProfile();
      expect(authStore.user).toEqual(UPDATED_USER);
      expect(authStore.token).toBe(UPDATED_TOKEN);
    });

    it("tracks operation status", async () => {
      store.setValue("name", "New Name");
      store.setValue("email", "new@example.com");
      expect(store.getStatus("update").status.isIdle).toBe(true);
      const promise = store.updateProfile();
      expect(store.getStatus("update").status.isLoading).toBe(true);
      await promise;
      expect(store.getStatus("update").status.isReady).toBe(true);
    });
  });
});
