import { Routes, Route } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Landing from './routes/Landing';
import Auth from './routes/Auth';
import Onboarding from './routes/Onboarding';
import Studio from './routes/Studio';
import Builder from './routes/Builder';
import Dashboard from './routes/Dashboard';
import GithubCallback from './routes/GithubCallback';
import AppShell from './app/AppShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/github/callback" element={<GithubCallback />} />
      <Route path="/studio" element={<RequireAuth><Studio /></RequireAuth>} />
      <Route path="/builder" element={<RequireAuth><Builder /></RequireAuth>} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      {/* New desktop-style shell (Chat/Cowork/Code). Public for now. */}
      <Route path="/app" element={<AppShell />} />
    </Routes>
  );
}
