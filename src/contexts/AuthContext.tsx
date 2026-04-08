import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase, invokeCloud } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any;
  userRole: string | null;
  orgId: string | null;
  teamId: string | null;
  isSupervisor: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isEcommerce: boolean;
  hasMetaApi: boolean;
  isImpersonating: boolean;
  impersonatedOrgId: string | null;
  mustChangePassword: boolean;
  startImpersonation: (orgId: string) => Promise<void>;
  stopImpersonation: () => void;
  refreshOrg: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  userRole: null,
  orgId: null,
  teamId: null,
  isSupervisor: false,
  isLoading: true,
  isSuperAdmin: false,
  isEcommerce: false,
  hasMetaApi: false,
  isImpersonating: false,
  impersonatedOrgId: null,
  mustChangePassword: false,
  startImpersonation: async () => {},
  stopImpersonation: () => {},
  refreshOrg: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isEcommerce, setIsEcommerce] = useState(false);
  const [hasMetaApi, setHasMetaApi] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedOrgId, setImpersonatedOrgId] = useState<string | null>(null);

  const isSuperAdmin = userRole === "super_admin";
  const isImpersonating = isSuperAdmin && !!impersonatedOrgId;

  // The effective org_id used throughout the app
  const effectiveOrgId = isImpersonating ? impersonatedOrgId : orgId;

  // Cache to skip re-fetch on rapid auth events
  const lastFetchRef = useRef({ userId: "", ts: 0 });

  const fetchUserData = async (userId: string) => {
    // Skip if same user fetched within last 3 seconds
    const now = Date.now();
    if (lastFetchRef.current.userId === userId && now - lastFetchRef.current.ts < 3000) return;
    lastFetchRef.current.userId = userId;
    lastFetchRef.current.ts = now;

    // Fire ALL queries in parallel — no sequential waits
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const profileData = profileRes.data;
    const orgIdVal = profileData?.org_id;

    // Set profile & role immediately (no waiting for org queries)
    if (profileData) {
      setProfile(profileData);
      setOrgId(orgIdVal);
    }

    // Resolve role synchronously
    if (roleRes.data && roleRes.data.length > 0) {
      const roles = roleRes.data.map((r: any) => r.role);
      if (roles.includes("super_admin")) setUserRole("super_admin");
      else if (roles.includes("admin") && !roles.includes("member")) setUserRole("admin");
      else if (roles.includes("member")) setUserRole("member");
      else if (roles.includes("admin")) setUserRole("admin");
      else setUserRole(roles[0]);
    } else {
      setUserRole("member");
    }

    // Org-level data in background (non-blocking)
    if (orgIdVal) {
      Promise.all([
        supabase.from("organizations").select("is_ecommerce").eq("id", orgIdVal).maybeSingle(),
        supabase.from("whatsapp_config_safe").select("id").eq("org_id", orgIdVal).eq("channel_type", "meta_api").eq("is_connected", true).limit(1).maybeSingle(),
      ]).then(([orgRes, metaRes]) => {
        setIsEcommerce(orgRes.data?.is_ecommerce || false);
        setHasMetaApi(!!metaRes.data);
      });
    }
  };

  const startImpersonation = async (targetOrgId: string) => {
    setImpersonatedOrgId(targetOrgId);
    setIsEcommerce(false);
    setHasMetaApi(false);

    const [orgRes, metaRes] = await Promise.all([
      supabase.from("organizations").select("is_ecommerce").eq("id", targetOrgId).maybeSingle(),
      supabase.from("whatsapp_config_safe").select("id").eq("org_id", targetOrgId).eq("channel_type", "meta_api").eq("is_connected", true).limit(1).maybeSingle(),
    ]);

    setIsEcommerce(orgRes.data?.is_ecommerce || false);
    setHasMetaApi(!!metaRes.data);
  };

  const refreshOrg = () => {
    const targetId = impersonatedOrgId || orgId;
    if (!targetId) return;
    Promise.all([
      supabase.from("organizations").select("is_ecommerce").eq("id", targetId).maybeSingle(),
      supabase.from("whatsapp_config_safe").select("id").eq("org_id", targetId).eq("channel_type", "meta_api").eq("is_connected", true).limit(1).maybeSingle(),
    ]).then(([orgRes, metaRes]) => {
      setIsEcommerce(orgRes.data?.is_ecommerce || false);
      setHasMetaApi(!!metaRes.data);
    });
  };

  const stopImpersonation = () => {
    setImpersonatedOrgId(null);
    if (!orgId) {
      setIsEcommerce(false);
      setHasMetaApi(false);
      return;
    }

    Promise.all([
      supabase.from("organizations").select("is_ecommerce").eq("id", orgId).maybeSingle(),
      supabase.from("whatsapp_config_safe").select("id").eq("org_id", orgId).eq("channel_type", "meta_api").eq("is_connected", true).limit(1).maybeSingle(),
    ]).then(([orgRes, metaRes]) => {
      setIsEcommerce(orgRes.data?.is_ecommerce || false);
      setHasMetaApi(!!metaRes.data);
    });
  };

  // Presence tracking — update is_online & last_seen_at
  useEffect(() => {
    if (!user) return;

    const updatePresence = () => {
      supabase
        .from("profiles")
        .update({ is_online: true, last_seen_at: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => {});
    };

    // Set online immediately
    updatePresence();

    // Trigger assign-on-reconnect for pending conversations
    if (profile?.org_id) {
      invokeCloud("assign-on-reconnect", {
        body: { org_id: profile.org_id, agent_id: user.id },
      }).catch(() => {});
    }

    // Update every 2 minutes
    const interval = setInterval(updatePresence, 2 * 60 * 1000);

    // Set offline on tab close / navigate away
    const handleOffline = () => {
      navigator.sendBeacon?.(
        `${(supabase as any).supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`,
        // sendBeacon doesn't support PATCH, so we use the interval approach as primary
      );
      // Fallback: just update via supabase
      supabase
        .from("profiles")
        .update({ is_online: false, last_seen_at: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        handleOffline();
      } else {
        updatePresence();
      }
    };

    window.addEventListener("beforeunload", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      // Mark offline on cleanup
      supabase
        .from("profiles")
        .update({ is_online: false, last_seen_at: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => {});
    };
  }, [user]);

  useEffect(() => {
    // Safety timeout: ALWAYS fires after 8s to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.warn("Auth safety timeout reached — forcing load complete");
      setIsLoading(false);
    }, 8000);

    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!initialSessionHandled) return; // skip duplicate initial event
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            await fetchUserData(session.user.id);
          } catch (e) {
            console.error("Failed to fetch user data:", e);
          }
        } else {
          setProfile(null);
          setUserRole(null);
          setOrgId(null);
          setIsEcommerce(false);
          setImpersonatedOrgId(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      initialSessionHandled = true;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await fetchUserData(session.user.id);
        } catch (e) {
          console.error("Failed to fetch user data:", e);
        }
      }
      clearTimeout(safetyTimeout);
      setIsLoading(false);
    }).catch(() => {
      initialSessionHandled = true;
      clearTimeout(safetyTimeout);
      setIsLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserRole(null);
    setOrgId(null);
    setIsEcommerce(false);
    setHasMetaApi(false);
    setImpersonatedOrgId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userRole,
        orgId: effectiveOrgId,
        teamId: profile?.team_id || null,
        isSupervisor: profile?.is_supervisor || false,
        isLoading,
        isSuperAdmin,
        isEcommerce,
        hasMetaApi,
        isImpersonating,
        impersonatedOrgId,
        mustChangePassword: !!user?.user_metadata?.must_change_password,
        startImpersonation,
        stopImpersonation,
        refreshOrg,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
