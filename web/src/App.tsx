import { Routes, Route, Navigate } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Landing from './routes/Landing';
import Auth from './routes/Auth';
import Onboarding from './routes/Onboarding';
import Studio from './routes/Studio';
import Builder from './routes/Builder';
import Dashboard from './routes/Dashboard';
import GithubCallback from './routes/GithubCallback';
import AppShell from './app/AppShell';
import { ChatView } from './app/ChatView';
import { CoworkView } from './app/CoworkView';
import { CodeView } from './app/CodeView';

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
      {/* Desktop-style shell — shared sidebar layout, a page per section, with
          id-based deep links (/app/chat/:id, /app/code/:id). Public for now. */}
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="chat" replace />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="chat/:id" element={<ChatView />} />
        <Route path="cowork" element={<CoworkView />} />
        <Route path="cowork/:id" element={<CoworkView />} />
        <Route path="code" element={<CodeView />} />
        <Route path="code/:id" element={<CodeView />} />
      </Route>
    </Routes>
  );
}
