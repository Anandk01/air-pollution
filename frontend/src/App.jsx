import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar        from "./components/Navbar";
import Footer        from "./components/Footer";
import Home          from "./pages/Home";
import Dashboard     from "./pages/Dashboard";
import UploadDataset from "./pages/UploadDataset";
import Analytics     from "./pages/Analytics";
import Predict       from "./pages/Predict";
import Alerts        from "./pages/Alerts";
import IndiaMap      from "./pages/IndiaMap";
import NotFound      from "./pages/NotFound";

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
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Navbar />
      <PageTransition>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload"    element={<UploadDataset />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/predict"   element={<Predict />} />
          <Route path="/alerts"    element={<Alerts />} />
          <Route path="/map"       element={<IndiaMap />} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </PageTransition>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
