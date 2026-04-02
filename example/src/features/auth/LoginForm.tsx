import { Component } from "react";
import { connect } from "snapstate/react";
import { loginFormStore } from "../../stores";

@connect(loginFormStore, {
  props: (s: typeof loginFormStore) => ({
    isLoading: s.getStatus("login").status.isLoading,
    error: s.getStatus("login").error,
  }),
  cleanup: (s: typeof loginFormStore) => s.clear(),
})
class LoginForm extends Component<{
  isLoading: boolean;
  error: string | null;
}> {
  handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginFormStore.login();
  };

  render() {
    const { isLoading, error } = this.props;

    return (
      <div className="login-form">
        <h1>Login</h1>
        <form onSubmit={this.handleSubmit}>
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
}

export { LoginForm };
