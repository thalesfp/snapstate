import { setDefaultHeaders } from "snapstate/react";
import { setDefaultHeaders as setFormDefaultHeaders } from "snapstate/form";
import { authStore } from "../stores";

export function setupHttpClient() {
  authStore.subscribe("token", () => {
    const token = authStore.token;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    setDefaultHeaders(headers);
    setFormDefaultHeaders(headers);
  });
}
