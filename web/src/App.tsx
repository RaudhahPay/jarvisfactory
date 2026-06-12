import { Routes, Route } from 'react-router-dom';

// Placeholder route components. The real pages are ported in Tasks A4/A5;
// for the SPA shell (Task A1) each route renders only a distinct marker.
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
      <Route path="/" element={<Placeholder testId="landing-route" label="Landing" />} />
      <Route path="/auth" element={<Placeholder testId="auth-route" label="Auth" />} />
      <Route path="/studio" element={<Placeholder testId="studio-route" label="Studio" />} />
      <Route path="/builder" element={<Placeholder testId="builder-route" label="Builder" />} />
      <Route path="/dashboard" element={<Placeholder testId="dashboard-route" label="Dashboard" />} />
      <Route path="/onboarding" element={<Placeholder testId="onboarding-route" label="Onboarding" />} />
    </Routes>
  );
}
