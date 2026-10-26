import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import { ToastProvider, Loading, Empty } from "./components/UI";
import { AdminLayout, PublicLayout } from "./components/Layouts";
const Login = lazy(() => import("./pages/LoginPage"));
const Vote = lazy(() => import("./pages/VotePage"));
const Dashboard = lazy(() => import("./pages/DashboardPage"));
const Sessions = lazy(() => import("./pages/SessionsPage"));
const Teams = lazy(() => import("./pages/TeamsPage"));
const Participants = lazy(() => import("./pages/ParticipantsPage"));
const Results = lazy(() => import("./pages/LiveResultsPage"));
const Settings = lazy(() => import("./pages/SettingsPage"));
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/vote" replace />} />
                <Route element={<PublicLayout />}>
                  <Route path="/vote" element={<Vote />} />
                  <Route path="/vote/:sessionId" element={<Vote />} />
                </Route>
                <Route path="/admin/login" element={<Login />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="sessions" element={<Sessions />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="participants" element={<Participants />} />
                  <Route path="results" element={<Results />} />
                  <Route path="history" element={<Sessions history />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route
                  path="/projector/:sessionId"
                  element={<Results projector />}
                />
                <Route
                  path="*"
                  element={
                    <Empty title="This page took a different path.">
                      <Link to="/vote">Return to voting</Link>
                    </Empty>
                  }
                />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
