import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./components/AppLayout";
import { Loader2 } from "lucide-react";

// Lazy load all pages
const AuthPage = lazy(() => import("./pages/AuthPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const AutomationPage = lazy(() => import("./pages/AutomationPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ConversationSettingsPage = lazy(() => import("./pages/ConversationSettingsPage"));
const AiSettingsPage = lazy(() => import("./pages/AiSettingsPage"));
const ApiTokensPage = lazy(() => import("./pages/ApiTokensPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const PlanUpgradePage = lazy(() => import("./pages/PlanUpgradePage"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const AbandonedCartsPage = lazy(() => import("./pages/AbandonedCartsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ChatbotPage = lazy(() => import("./pages/ChatbotPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const PaymentCallbackPage = lazy(() => import("./pages/PaymentCallbackPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ScheduledMessagesPage = lazy(() => import("./pages/ScheduledMessagesPage"));
const CustomPlanPage = lazy(() => import("./pages/CustomPlanPage"));
const WhatsAppFlowsPage = lazy(() => import("./pages/WhatsAppFlowsPage"));
const TrackingPage = lazy(() => import("./pages/TrackingPage"));
const StoreAnalyticsPage = lazy(() => import("./pages/StoreAnalyticsPage"));
const WarehousesPage = lazy(() => import("./pages/WarehousesPage"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
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
      <Route path="/auth" element={user ? (shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/" replace />) : <AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/" element={shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><AppLayout><InboxPage /></AppLayout></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><AppLayout><CustomersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AppLayout><AnalyticsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><AppLayout><CampaignsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/automation" element={<ProtectedRoute><AppLayout><AutomationPage /></AppLayout></ProtectedRoute>} />
      <Route path="/chatbot" element={<ProtectedRoute><AppLayout><ChatbotPage /></AppLayout></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><AppLayout><TeamPage /></AppLayout></ProtectedRoute>} />
      <Route path="/plans" element={<ProtectedRoute><AppLayout><PlanUpgradePage /></AppLayout></ProtectedRoute>} />
      <Route path="/integrations" element={<ProtectedRoute><AppLayout><IntegrationsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/conversation-settings" element={<ProtectedRoute><AppLayout><ConversationSettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/ai-settings" element={<ProtectedRoute><AppLayout><AiSettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/api-tokens" element={<ProtectedRoute><AppLayout><ApiTokensPage /></AppLayout></ProtectedRoute>} />
      <Route path="/templates" element={<MetaApiRoute><AppLayout><TemplatesPage /></AppLayout></MetaApiRoute>} />
      <Route path="/wallet" element={<ProtectedRoute><AppLayout><WalletPage /></AppLayout></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><AppLayout><OrdersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/abandoned-carts" element={<ProtectedRoute><AppLayout><AbandonedCartsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/store-analytics" element={<ProtectedRoute><AppLayout><StoreAnalyticsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute><AppLayout><WarehousesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/api-docs" element={<ProtectedRoute><AppLayout><ApiDocsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/checkout" element={<ProtectedRoute><AppLayout><CheckoutPage /></AppLayout></ProtectedRoute>} />
      <Route path="/payment-callback" element={<ProtectedRoute><AppLayout><PaymentCallbackPage /></AppLayout></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
      <Route path="/scheduled-messages" element={<ProtectedRoute><AppLayout><ScheduledMessagesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/custom-plan" element={<ProtectedRoute><AppLayout><CustomPlanPage /></AppLayout></ProtectedRoute>} />
      <Route path="/wa-flows" element={<ProtectedRoute><AppLayout><WhatsAppFlowsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/tracking" element={<TrackingPage />} />
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
