import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any;
  userRole: string | null;
  orgId: string | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isEcommerce: boolean;
  hasMetaApi: boolean;
  isImpersonating: boolean;
  impersonatedOrgId: string | null;
  startImpersonation: (orgId: string) => void;
  stopImpersonation: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  userRole: null,
  orgId: null,
  isLoading: true,
  isSuperAdmin: false,
  isEcommerce: false,
  hasMetaApi: false,
  isImpersonating: false,
  impersonatedOrgId: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
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

  const fetchUserData = async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data);
      setOrgId(profileRes.data.org_id);
      if (profileRes.data.org_id) {
        const [orgRes, metaRes] = await Promise.all([
          supabase.from("organizations").select("is_ecommerce").eq("id", profileRes.data.org_id).maybeSingle(),
          supabase.from("whatsapp_config").select("id").eq("org_id", profileRes.data.org_id).eq("channel_type", "meta_api").eq("is_connected", true).limit(1).maybeSingle(),
        ]);
        setIsEcommerce(orgRes.data?.is_ecommerce || false);
        setHasMetaApi(!!metaRes.data);
      }
    }
    if (roleRes.data && roleRes.data.length > 0) {
      const roles = roleRes.data.map((r: any) => r.role);
      if (roles.includes("super_admin")) setUserRole("super_admin");
      else if (roles.includes("admin")) setUserRole("admin");
      else setUserRole(roles[0]);
    }
  };

  const startImpersonation = async (targetOrgId: string) => {
    setImpersonatedOrgId(targetOrgId);
    // Fetch ecommerce status for impersonated org
    const { data: orgData } = await supabase.from("organizations").select("is_ecommerce").eq("id", targetOrgId).maybeSingle();
    setIsEcommerce(orgData?.is_ecommerce || false);
  };

  const stopImpersonation = () => {
    setImpersonatedOrgId(null);
    // Restore original org's ecommerce status
    if (orgId) {
      supabase.from("organizations").select("is_ecommerce").eq("id", orgId).maybeSingle().then(({ data }) => {
        setIsEcommerce(data?.is_ecommerce || false);
      });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
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

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
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
        isLoading,
        isSuperAdmin,
        isEcommerce,
        hasMetaApi,
        isImpersonating,
        impersonatedOrgId,
        startImpersonation,
        stopImpersonation,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
