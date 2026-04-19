import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

// Eagerly loaded (critical path)
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";

// Lazy loaded pages
const InboxPage = lazy(() => import("./pages/InboxPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const AutomationPage = lazy(() => import("./pages/AutomationPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const SavedRepliesPage = lazy(() => import("./pages/SavedRepliesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ConversationSettingsPage = lazy(() => import("./pages/ConversationSettingsPage"));
const AiSettingsPage = lazy(() => import("./pages/AiSettingsPage"));
const ApiTokensPage = lazy(() => import("./pages/ApiTokensPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const AbandonedCartsPage = lazy(() => import("./pages/AbandonedCartsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardPage = lazy(() => import("./pages/DashboardPageNew"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ChatbotPage = lazy(() => import("./pages/ChatbotPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const PaymentCallbackPage = lazy(() => import("./pages/PaymentCallbackPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ScheduledMessagesPage = lazy(() => import("./pages/ScheduledMessagesPage"));
const CustomPlanPage = lazy(() => import("./pages/CustomPlanPage"));
const CustomPlanBuilderPage = lazy(() => import("./pages/CustomPlanBuilderPage"));
const WhatsAppFlowsPage = lazy(() => import("./pages/WhatsAppFlowsPage"));
const TrackingPage = lazy(() => import("./pages/TrackingPage"));
const StoreAnalyticsPage = lazy(() => import("./pages/StoreAnalyticsPage"));
const ConversationAnalyticsPage = lazy(() => import("./pages/ConversationAnalyticsPage"));
const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const LockedFeaturesPage = lazy(() => import("./pages/LockedFeaturesPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const ForceChangePasswordPage = lazy(() => import("./pages/ForceChangePasswordPage"));
const EmergencyAdminPage = lazy(() => import("./pages/EmergencyAdminPage"));
const SafetyGuidePage = lazy(() => import("./pages/SafetyGuidePage"));
const GrowthToolsPage = lazy(() => import("./pages/GrowthToolsPage"));
const PermissionsPage = lazy(() => import("./pages/PermissionsPage"));
const InstallPage = lazy(() => import("./pages/InstallPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const ProtectedRoute = ({ children, minRole }: { children: React.ReactNode; minRole?: "admin" | "supervisor" | "member" }) => {
  const { user, isLoading, mustChangePassword, userRole, profile, isSuperAdmin } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  if (minRole && !userRole && !isSuperAdmin) {
    return <PageLoader />;
  }

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
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const MetaApiRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, hasMetaApi, metaApiChecked } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  // Avoid redirect flashes on hard refresh while meta_api capability is still being checked.
  if (!metaApiChecked) return <PageLoader />;
  if (!hasMetaApi) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, isLoading, isSuperAdmin, isImpersonating, userRole, profile } = useAuth();

  if (isLoading) return <PageLoader />;
  // Wait for role to load before redirecting — prevents super_admin landing on /inbox
  if (user && !userRole && !isSuperAdmin) return <PageLoader />;

  const shouldRedirectToAdmin = isSuperAdmin && !isImpersonating;
  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const defaultPath = effectiveRole === "admin" ? "/dashboard" : "/inbox";

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/auth" element={user ? (shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <Navigate to={defaultPath} replace />) : <AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-password" element={user ? <ForceChangePasswordPage /> : <Navigate to="/auth" replace />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/" element={user ? (shouldRedirectToAdmin ? <Navigate to="/admin" replace /> : <Navigate to={defaultPath} replace />) : <LandingPage />} />
        <Route path="/dashboard" element={<ProtectedRoute minRole="admin"><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><AppLayout><InboxPage inboxMode="whatsapp" /></AppLayout></ProtectedRoute>} />
        <Route path="/email-inbox" element={<ProtectedRoute><AppLayout><InboxPage inboxMode="email" /></AppLayout></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute minRole="agent"><AppLayout><CustomersPage /></AppLayout></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute minRole="supervisor"><AppLayout><AnalyticsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/campaigns" element={<ProtectedRoute minRole="admin"><AppLayout><CampaignsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/automation" element={<ProtectedRoute minRole="admin"><AppLayout><AutomationPage /></AppLayout></ProtectedRoute>} />
        <Route path="/chatbot" element={<ProtectedRoute minRole="admin"><AppLayout><ChatbotPage /></AppLayout></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute minRole="supervisor"><AppLayout><TeamPage /></AppLayout></ProtectedRoute>} />
        <Route path="/plans" element={<ProtectedRoute minRole="admin"><AppLayout><CustomPlanBuilderPage /></AppLayout></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute minRole="admin"><AppLayout><IntegrationsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/saved-replies" element={<ProtectedRoute minRole="agent"><AppLayout><SavedRepliesPage /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute minRole="admin"><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/conversation-settings" element={<ProtectedRoute minRole="admin"><AppLayout><ConversationSettingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/ai-settings" element={<ProtectedRoute minRole="admin"><AppLayout><AiSettingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/ai-studio" element={<Navigate to="/ai-settings" replace />} />
        <Route path="/api-tokens" element={<ProtectedRoute minRole="admin"><AppLayout><ApiTokensPage /></AppLayout></ProtectedRoute>} />
        <Route path="/templates" element={<MetaApiRoute><AppLayout><TemplatesPage /></AppLayout></MetaApiRoute>} />
        <Route path="/catalog" element={<MetaApiRoute><AppLayout><CatalogPage /></AppLayout></MetaApiRoute>} />
        <Route path="/wallet" element={<ProtectedRoute minRole="admin"><AppLayout><WalletPage /></AppLayout></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute minRole="admin"><AppLayout><OrdersPage /></AppLayout></ProtectedRoute>} />
        <Route path="/abandoned-carts" element={<ProtectedRoute minRole="admin"><AppLayout><AbandonedCartsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/store-analytics" element={<ProtectedRoute minRole="admin"><AppLayout><StoreAnalyticsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/conversation-analytics" element={<MetaApiRoute><AppLayout><ConversationAnalyticsPage /></AppLayout></MetaApiRoute>} />
        <Route path="/reports" element={<ProtectedRoute minRole="supervisor"><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/api-docs" element={<ProtectedRoute minRole="admin"><AppLayout><ApiDocsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute minRole="admin"><AppLayout><CheckoutPage /></AppLayout></ProtectedRoute>} />
        <Route path="/payment-callback" element={<ProtectedRoute minRole="admin"><AppLayout><PaymentCallbackPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute minRole="admin"><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
        <Route path="/scheduled-messages" element={<ProtectedRoute minRole="admin"><AppLayout><ScheduledMessagesPage /></AppLayout></ProtectedRoute>} />
        <Route path="/custom-plan" element={<ProtectedRoute minRole="admin"><AppLayout><CustomPlanPage /></AppLayout></ProtectedRoute>} />
        <Route path="/build-plan" element={<ProtectedRoute minRole="admin"><AppLayout><CustomPlanBuilderPage /></AppLayout></ProtectedRoute>} />
        <Route path="/wa-flows" element={<ProtectedRoute minRole="admin"><AppLayout><WhatsAppFlowsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/locked-features" element={<ProtectedRoute><AppLayout><LockedFeaturesPage /></AppLayout></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><AppLayout><TasksPage /></AppLayout></ProtectedRoute>} />
        <Route path="/tickets" element={<ProtectedRoute><AppLayout><TicketsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/safety-guide" element={<ProtectedRoute><AppLayout><SafetyGuidePage /></AppLayout></ProtectedRoute>} />
        <Route path="/growth-tools" element={<ProtectedRoute minRole="admin"><AppLayout><GrowthToolsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/permissions" element={<ProtectedRoute minRole="admin"><AppLayout><PermissionsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/install" element={<InstallPage />} />
        <Route path="/tracking" element={<TrackingPage />} />
        <Route path="/emergency-admin" element={<ProtectedRoute minRole="admin"><AppLayout><EmergencyAdminPage /></AppLayout></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

