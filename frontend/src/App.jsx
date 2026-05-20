import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LocationProvider } from "./context/LocationContext";
import { ProfileProvider } from "./context/ProfileContext";
import { AuthProvider } from "./context/AuthContext";
import AppShell       from "./layouts/AppShell";
import Home           from "./pages/Home";
import Dashboard      from "./pages/Dashboard";
import UploadDataset  from "./pages/UploadDataset";
import Analytics      from "./pages/Analytics";
import Predict        from "./pages/Predict";
import Alerts         from "./pages/Alerts";
import IndiaMap          from "./pages/IndiaMap";
import AnomalyDashboard  from "./pages/AnomalyDashboard";
import SatelliteView     from "./pages/SatelliteView";
import ProfileForm       from "./pages/ProfileForm";
import Auth              from "./pages/Auth";
import Admin             from "./pages/Admin";
import SafeRouteNavigator    from "./pages/SafeRouteNavigator";
import CommunityReportsPage  from "./pages/CommunityReportsPage";
import NotFound              from "./pages/NotFound";

function PageTransition({ children }) {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);
  return <div key={location.pathname} className="page-fade">{children}</div>;
}

function RouterShell() {
  return (
    <AppShell>
      <PageTransition>
        <Routes>
          <Route path="/auth"        element={<Auth />} />
          <Route path="/"            element={<Home />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/upload"      element={<UploadDataset />} />
          <Route path="/analytics"   element={<Analytics />} />
          <Route path="/predict"     element={<Predict />} />
          <Route path="/alerts"      element={<Alerts />} />
          <Route path="/map"         element={<IndiaMap />} />
          <Route path="/anomalies"   element={<AnomalyDashboard />} />
          <Route path="/satellite"   element={<SatelliteView />} />
          <Route path="/profile"     element={<ProfileForm />} />
          <Route path="/admin"       element={<Admin />} />
          <Route path="/safe-routes" element={<SafeRouteNavigator />} />
          <Route path="/community"   element={<CommunityReportsPage />} />
          <Route path="*"            element={<NotFound />} />
        </Routes>
      </PageTransition>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <LocationProvider>
            <ToastProvider>
              <BrowserRouter>
                <RouterShell />
              </BrowserRouter>
            </ToastProvider>
          </LocationProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
