import { Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Auth from './routes/Auth';
import Onboarding from './routes/Onboarding';

// Placeholder route components for routes ported in Task A5; for the SPA shell
// each remaining route renders only a distinct marker.
const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  fontFamily: 'system-ui, sans-serif',
};

function Placeholder({ testId, label }: { testId: string; label: string }) {
  return (
    <main style={wrap}>
      <h1 data-testid={testId}>{label}</h1>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/studio" element={<Placeholder testId="studio-route" label="Studio" />} />
      <Route path="/builder" element={<Placeholder testId="builder-route" label="Builder" />} />
      <Route path="/dashboard" element={<Placeholder testId="dashboard-route" label="Dashboard" />} />
      <Route path="/onboarding" element={<Onboarding />} />
    </Routes>
  );
}
