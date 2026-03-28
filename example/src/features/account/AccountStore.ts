import { SnapFormStore } from "snapstate/form";
import { z } from "zod";
import type { User } from "../../shared/types";
import type { AuthStore } from "../auth/AuthStore";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  notifications: z.boolean(),
  theme: z.enum(["light", "dark", "system"]),
});

type ProfileValues = z.infer<typeof profileSchema>;

export class AccountStore extends SnapFormStore<ProfileValues, "update"> {
  private auth: AuthStore;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(authStore: AuthStore) {
    super(profileSchema, { name: "", email: "", notifications: false, theme: "system" }, { validationMode: "onBlur" });
    this.auth = authStore;
  }

  loadProfile(user: User) {
    this.setInitialValues({ name: user.name, email: user.email, notifications: user.notifications, theme: user.theme });
  }

  loadCurrentProfile() {
    const user = this.auth.user;
    if (user) {
      this.loadProfile(user);
    }
  }

  updateProfile() {
    const data = this.validate();
    if (!data) return;
    this.syncSubmitStatus("update");
    return this.api.patch<{ token: string; user: User }>("update", "/api/account/profile", {
      body: data,
      onSuccess: (result) => {
        this.setInitialValues({
          name: result.user.name,
          email: result.user.email,
          notifications: result.user.notifications,
          theme: result.user.theme,
        });
        this.auth.setUser(result.user);
        this.auth.setToken(result.token);
        if (this.resetTimer) {
          clearTimeout(this.resetTimer);
        }
        this.resetTimer = setTimeout(() => {
          this.resetTimer = null;
          this.resetStatus("update");
        }, 2000);
      },
    });
  }
}
