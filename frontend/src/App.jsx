import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LocationProvider } from "./context/LocationContext";
import { ProfileProvider } from "./context/ProfileContext";
import Navbar        from "./components/Navbar";
import Footer        from "./components/Footer";
import Home          from "./pages/Home";
import Dashboard     from "./pages/Dashboard";
import UploadDataset from "./pages/UploadDataset";
import Analytics     from "./pages/Analytics";
import Predict       from "./pages/Predict";
import Alerts        from "./pages/Alerts";
import IndiaMap         from "./pages/IndiaMap";
import AnomalyDashboard from "./pages/AnomalyDashboard";
import SatelliteView    from "./pages/SatelliteView";
import ProfileForm      from "./pages/ProfileForm";
import Auth             from "./pages/Auth";
import Admin            from "./pages/Admin";
import SafeRouteNavigator from "./pages/SafeRouteNavigator";
import { AuthProvider, useAuth } from "./context/AuthContext";
import NotFound         from "./pages/NotFound";
import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
  // Temporarily removed login system
  return children;
}

/** Scroll to top + fade animation on route change */
function PageTransition({ children }) {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div key={location.pathname} className="page-fade">
      {children}
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const hideNav = false; // location.pathname === "/auth"; // Temporarily showing nav everywhere

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {!hideNav && <Navbar />}
      <PageTransition>
        <Routes>
          <Route path="/auth"      element={<Auth />} />
          <Route path="/"          element={<Home />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/upload"    element={<ProtectedRoute><UploadDataset /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/predict"   element={<ProtectedRoute><Predict /></ProtectedRoute>} />
          <Route path="/alerts"    element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
          <Route path="/map"       element={<ProtectedRoute><IndiaMap /></ProtectedRoute>} />
          <Route path="/anomalies" element={<ProtectedRoute><AnomalyDashboard /></ProtectedRoute>} />
          <Route path="/satellite" element={<ProtectedRoute><SatelliteView /></ProtectedRoute>} />
          <Route path="/profile"   element={<ProtectedRoute><ProfileForm /></ProtectedRoute>} />
          <Route path="/admin"     element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/safe-routes" element={<ProtectedRoute><SafeRouteNavigator /></ProtectedRoute>} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </PageTransition>
      {!hideNav && <Footer />}
    </div>
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
                <AppShell />
              </BrowserRouter>
            </ToastProvider>
          </LocationProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
