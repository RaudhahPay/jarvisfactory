import { Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Auth from './routes/Auth';
import Onboarding from './routes/Onboarding';
import Studio from './routes/Studio';
import Builder from './routes/Builder';
import Dashboard from './routes/Dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/onboarding" element={<Onboarding />} />
    </Routes>
  );
}
