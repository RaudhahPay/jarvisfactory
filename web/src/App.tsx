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
import { CodeLanding } from './app/code/CodeLanding';
import { ProjectWorkspace } from './app/code/ProjectWorkspace';
import { SettingsLayout } from './app/settings/SettingsLayout';
import { GeneralPanel } from './app/settings/GeneralPanel';
import { DomainsPanel } from './app/settings/DomainsPanel';
import { ConnectorsPanel } from './app/settings/ConnectorsPanel';
import { BillingPanel } from './app/settings/BillingPanel';
import { MembersPanel } from './app/settings/MembersPanel';

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
        <Route path="code" element={<CodeLanding />} />
      </Route>
      {/* Project editor is its own full-screen page (own top bar, not the shell). */}
      <Route path="/app/code/:id" element={<ProjectWorkspace />} />
      {/* Settings — full-page layout with persistent left nav. */}
      <Route path="/settings" element={<SettingsLayout />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralPanel />} />
        <Route path="domains" element={<DomainsPanel />} />
        <Route path="connectors" element={<ConnectorsPanel />} />
        <Route path="billing" element={<BillingPanel />} />
        <Route path="members" element={<MembersPanel />} />
      </Route>
    </Routes>
  );
}
