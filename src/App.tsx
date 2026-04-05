import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";
import InboxPage from "./pages/InboxPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CampaignsPage from "./pages/CampaignsPage";
import AutomationPage from "./pages/AutomationPage";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import ConversationSettingsPage from "./pages/ConversationSettingsPage";
import AiSettingsPage from "./pages/AiSettingsPage";
import ApiTokensPage from "./pages/ApiTokensPage";
import TemplatesPage from "./pages/TemplatesPage";
import WalletPage from "./pages/WalletPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CustomersPage from "./pages/CustomersPage";
import PlanUpgradePage from "./pages/PlanUpgradePage";
import IntegrationsPage from "./pages/IntegrationsPage";
import OrdersPage from "./pages/OrdersPage";
import AbandonedCartsPage from "./pages/AbandonedCartsPage";
import NotFound from "./pages/NotFound";
import DashboardPage from "./pages/DashboardPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ApiDocsPage from "./pages/ApiDocsPage";
import ReportsPage from "./pages/ReportsPage";
import ChatbotPage from "./pages/ChatbotPage";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentCallbackPage from "./pages/PaymentCallbackPage";
import BillingPage from "./pages/BillingPage";
import ScheduledMessagesPage from "./pages/ScheduledMessagesPage";
import CustomPlanPage from "./pages/CustomPlanPage";
import WhatsAppFlowsPage from "./pages/WhatsAppFlowsPage";
import TrackingPage from "./pages/TrackingPage";
import StoreAnalyticsPage from "./pages/StoreAnalyticsPage";
import ConversationAnalyticsPage from "./pages/ConversationAnalyticsPage";
import CatalogPage from "./pages/CatalogPage";
import WarehousesPage from "./pages/WarehousesPage";
import LockedFeaturesPage from "./pages/LockedFeaturesPage";
import LandingPage from "./pages/LandingPage";
import TasksPage from "./pages/TasksPage";
import ForceChangePasswordPage from "./pages/ForceChangePasswordPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import EmergencyAdminPage from "./pages/EmergencyAdminPage";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, minRole }: { children: React.ReactNode; minRole?: "admin" | "supervisor" | "member" }) => {
  const { user, isLoading, mustChangePassword, userRole, profile, isSuperAdmin } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  // Role-based access check
  if (minRole && !isSuperAdmin) {
    const effectiveRole = userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
    const hierarchy: Record<string, number> = { member: 0, supervisor: 1, admin: 2 };
    if ((hierarchy[effectiveRole] ?? 0) < (hierarchy[minRole] ?? 0)) {
      return <Navigate to="/inbox" replace />;
    }
  }

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isSuperAdmin, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const MetaApiRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, hasMetaApi } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasMetaApi) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, isLoading, isSuperAdmin, isImpersonating } = useAuth();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Super admin accessing client routes when impersonating
  const shouldRedirectToAdmin = isSuperAdmin && !isImpersonating;

  return (
    <Routes>
      <Route path="/auth" element={user ? (shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />) : <AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/change-password" element={user ? <ForceChangePasswordPage /> : <Navigate to="/auth" replace />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/" element={user ? (shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />) : <LandingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute minRole="admin"><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><AppLayout><InboxPage /></AppLayout></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute minRole="admin"><AppLayout><CustomersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute minRole="supervisor"><AppLayout><AnalyticsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute minRole="admin"><AppLayout><CampaignsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/automation" element={<ProtectedRoute minRole="admin"><AppLayout><AutomationPage /></AppLayout></ProtectedRoute>} />
      <Route path="/chatbot" element={<ProtectedRoute minRole="admin"><AppLayout><ChatbotPage /></AppLayout></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute minRole="supervisor"><AppLayout><TeamPage /></AppLayout></ProtectedRoute>} />
      <Route path="/plans" element={<ProtectedRoute minRole="admin"><AppLayout><PlanUpgradePage /></AppLayout></ProtectedRoute>} />
      <Route path="/integrations" element={<ProtectedRoute minRole="admin"><AppLayout><IntegrationsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute minRole="admin"><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/conversation-settings" element={<ProtectedRoute minRole="admin"><AppLayout><ConversationSettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/ai-settings" element={<ProtectedRoute minRole="admin"><AppLayout><AiSettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/api-tokens" element={<ProtectedRoute minRole="admin"><AppLayout><ApiTokensPage /></AppLayout></ProtectedRoute>} />
      <Route path="/templates" element={<MetaApiRoute><AppLayout><TemplatesPage /></AppLayout></MetaApiRoute>} />
      <Route path="/catalog" element={<MetaApiRoute><AppLayout><CatalogPage /></AppLayout></MetaApiRoute>} />
      <Route path="/wallet" element={<ProtectedRoute minRole="admin"><AppLayout><WalletPage /></AppLayout></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute minRole="admin"><AppLayout><OrdersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/abandoned-carts" element={<ProtectedRoute minRole="admin"><AppLayout><AbandonedCartsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/store-analytics" element={<ProtectedRoute minRole="admin"><AppLayout><StoreAnalyticsPage /></AppLayout></ProtectedRoute>} />
      {/* <Route path="/warehouses" element={<ProtectedRoute minRole="admin"><AppLayout><WarehousesPage /></AppLayout></ProtectedRoute>} /> */}{/* Hidden until Lamha integration is complete */}
      <Route path="/conversation-analytics" element={<MetaApiRoute><AppLayout><ConversationAnalyticsPage /></AppLayout></MetaApiRoute>} />
      <Route path="/reports" element={<ProtectedRoute minRole="supervisor"><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/api-docs" element={<ProtectedRoute minRole="admin"><AppLayout><ApiDocsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/checkout" element={<ProtectedRoute minRole="admin"><AppLayout><CheckoutPage /></AppLayout></ProtectedRoute>} />
      <Route path="/payment-callback" element={<ProtectedRoute minRole="admin"><AppLayout><PaymentCallbackPage /></AppLayout></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute minRole="admin"><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
      <Route path="/scheduled-messages" element={<ProtectedRoute minRole="admin"><AppLayout><ScheduledMessagesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/custom-plan" element={<ProtectedRoute minRole="admin"><AppLayout><CustomPlanPage /></AppLayout></ProtectedRoute>} />
      <Route path="/wa-flows" element={<ProtectedRoute minRole="admin"><AppLayout><WhatsAppFlowsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/locked-features" element={<ProtectedRoute><AppLayout><LockedFeaturesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><AppLayout><TasksPage /></AppLayout></ProtectedRoute>} />
      <Route path="/tracking" element={<TrackingPage />} />
      <Route path="/system-status" element={<SystemStatusPage />} />
      <Route path="/emergency-admin" element={<EmergencyAdminPage />} />
      
      <Route path="*" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
