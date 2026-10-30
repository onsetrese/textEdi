import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { CssBaseline } from "@mui/material";
import AuthGuard from "./components/AuthGuard.jsx";
import Navbar from "./components/Navbar.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DocumentListPage from "./pages/DocumentListPage.jsx";
import EditorPage from "./pages/EditorPage.jsx";

/** Layout for authenticated pages: renders the top Navbar above the page content. */
function ProtectedLayout() {
  return (
    <AuthGuard>
      <Navbar />
      <Outlet />
    </AuthGuard>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CssBaseline />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — share a single layout with Navbar */}
        <Route element={<ProtectedLayout />}>
          <Route path="/documents" element={<DocumentListPage />} />
          <Route path="/documents/:id" element={<EditorPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/documents" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
