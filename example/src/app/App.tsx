import { useSyncExternalStore, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from "react-router";
import { authStore } from "../stores";
import type { User } from "../stores";
import { TodoApp } from "../features/todos/TodoApp";
import { TodoDetailPage } from "../features/todos/TodoDetailPage";
import { LoginForm } from "../features/auth/LoginForm";
import { ProfilePage } from "../features/account/ProfilePage";

function useAuthToken() {
  const subscribe = useCallback(
    (cb: () => void) => authStore.subscribe("token", cb),
    [],
  );
  const getSnapshot = useCallback(() => authStore.token, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function GuestRoute() {
  const token = useAuthToken();
  return token ? <Navigate to="/todos" replace /> : <Outlet />;
}

function ProtectedRoute() {
  const token = useAuthToken();
  return token ? <Outlet /> : <Navigate to="/" replace />;
}

function AppLayoutInner({ user }: { user: User | null }) {
  return (
    <>
      <div className="app-header">
        <span className="user-info">{user?.name}</span>
        <Link to="/profile" className="logout-btn">
          Profile
        </Link>
        <button className="logout-btn" onClick={() => authStore.logout()}>
          Logout
        </button>
      </div>
      <Outlet />
    </>
  );
}

const AppLayout = authStore.connect(AppLayoutInner, {
  select: ["user"],
});

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/" element={<LoginForm />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/todos" element={<TodoApp />} />
            <Route path="/todos/:id" element={<TodoDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
