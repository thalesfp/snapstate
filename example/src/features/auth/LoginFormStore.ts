import { SnapFormStore } from "snapstate/form";
import { z } from "zod";
import type { User } from "../../shared/types";
import type { AuthStore } from "./AuthStore";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export class LoginFormStore extends SnapFormStore<LoginValues, "login"> {
  private auth: AuthStore;

  constructor(authStore: AuthStore) {
    super(loginSchema, { email: "demo@example.com", password: "Demo@2024!" });
    this.auth = authStore;
  }

  login() {
    return this.submit("login", async (values) => {
      const result = await this.http.request<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: values,
      });
      this.auth.setUser(result.user);
      this.auth.setToken(result.token);
    });
  }
}
