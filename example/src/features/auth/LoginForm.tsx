import { loginFormStore } from "../../stores";

function LoginFormInner({ isLoading, error }: { isLoading: boolean; error: string | null }) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginFormStore.login();
  };

  return (
    <div className="login-form">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          {...loginFormStore.register("email")}
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Password"
          {...loginFormStore.register("password")}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Logging in..." : "Login"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  );
}

export const LoginForm = loginFormStore.connect(LoginFormInner, {
  props: (s: typeof loginFormStore) => ({
    isLoading: s.getStatus("login").status.isLoading,
    error: s.getStatus("login").error,
  }),
  cleanup: (s: typeof loginFormStore) => s.clear(),
});
