import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SubscriptionConfirmed from '@/pages/SubscriptionConfirmed';
import Pricing from '@/pages/Pricing';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Admin from '@/pages/Admin';
import SharedDocumentView from '@/pages/share/SharedDocumentView';
import SharedMeetingView from '@/pages/share/SharedMeetingView';
import FreeMeeting from '@/pages/FreeMeeting';
import Landing from '@/pages/Landing';
import ButtonDemoTest from '@/pages/_ButtonDemoTest';
import BoardroomDemoTest from '@/pages/_BoardroomDemoTest';

import Companies from '@/pages/Companies';
import CompanyLayout from '@/components/CompanyLayout';
import Dashboard from '@/pages/company/Dashboard';
import ExecutiveTeam from '@/pages/company/ExecutiveTeam';
import Boardroom from '@/pages/company/Boardroom';
import Projects from '@/pages/company/Projects';
import Tasks from '@/pages/company/Tasks';
import Pins from '@/pages/company/Pins';
import Knowledge from '@/pages/company/Knowledge';
import Documents from '@/pages/company/Documents';
import Research from '@/pages/company/Research';
import Decisions from '@/pages/company/Decisions';
import Meetings from '@/pages/company/Meetings';
import CompanySettings from '@/pages/company/CompanySettings';
// import CompanySettings from '@/pages/company/CompanySettings';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/subscription-confirmed" element={<SubscriptionConfirmed />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/share/document/:token" element={<SharedDocumentView />} />
      <Route path="/share/meeting/:token" element={<SharedMeetingView />} />
      <Route path="/board" element={<FreeMeeting />} />
      <Route path="/_test/buttons" element={<ButtonDemoTest />} />
      <Route path="/_test/boardroom" element={<BoardroomDemoTest />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Landing />} />}>
        <Route path="/" element={<Companies />} />
      </Route>
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/admin" element={<Admin />} />
        {/* The explicit hub — never auto-redirects, even for a single-
            company account. "/" is the smart entry point used right after
            login (skips straight into your one company); this is what
            "My Companies" in the sidebar points to instead, so a
            single-company founder can still reach the hub to start a
            second company. */}
        <Route path="/companies" element={<Companies skipRedirect />} />
        <Route path="/company/:companyId" element={<CompanyLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="team" element={<ExecutiveTeam />} />
          <Route path="boardroom" element={<Boardroom />} />
          <Route path="projects" element={<Projects />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="pins" element={<Pins />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="documents" element={<Documents />} />
          <Route path="research" element={<Research />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="settings" element={<CompanySettings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App