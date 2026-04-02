import { useState } from "react";
import { Link } from "react-router";
import { accountStore } from "../../stores";
import type { OperationState } from "snapstate/react";

function ProfilePageInner({
  nameError,
  emailError,
  themeError,
  submitStatus,
}: {
  nameError: string[] | undefined;
  emailError: string[] | undefined;
  themeError: string[] | undefined;
  submitStatus: OperationState;
}) {
  const [success, setSuccess] = useState(false);
  const isUpdating = submitStatus.status.isLoading;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);

    await accountStore.updateProfile();

    setSuccess(true);
  };

  return (
    <div className="profile-page">
      <h1>Profile</h1>
      <form className="profile-form" onSubmit={handleSave}>
        <label>
          Name
          <input
            data-testid="profile-name"
            {...accountStore.register("name")}
          />
          {nameError && <span className="field-error">{nameError[0]}</span>}
        </label>
        <label>
          Email
          <input
            data-testid="profile-email"
            {...accountStore.register("email")}
          />
          {emailError && <span className="field-error">{emailError[0]}</span>}
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            data-testid="profile-notifications"
            {...accountStore.register("notifications")}
          />
          Receive notifications
        </label>
        <label>
          Theme
          <select
            data-testid="profile-theme"
            {...accountStore.register("theme")}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
          {themeError && <span className="field-error">{themeError[0]}</span>}
        </label>
        <button className="profile-btn" type="submit" disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </button>
        {success && <span className="profile-success">Profile updated!</span>}
      </form>
      <Link to="/todos" className="profile-btn profile-back">
        Back to Todos
      </Link>
    </div>
  );
}

export const ProfilePage = accountStore.connect(ProfilePageInner, {
  select: (pick) => ({
    nameError: pick("errors.name"),
    emailError: pick("errors.email"),
    themeError: pick("errors.theme"),
    submitStatus: pick("submitStatus"),
  }),
  setup: (s) => {
    s.loadCurrentProfile();
  },
  cleanup: (s) => {
    s.reset();
  },
});
