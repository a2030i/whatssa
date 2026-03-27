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
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data);
      setOrgId(profileRes.data.org_id);
      // Fetch org ecommerce status
      if (profileRes.data.org_id) {
        const { data: orgData } = await supabase.from("organizations").select("is_ecommerce").eq("id", profileRes.data.org_id).maybeSingle();
        setIsEcommerce(orgData?.is_ecommerce || false);
      }
    }
    if (roleRes.data && roleRes.data.length > 0) {
      const roles = roleRes.data.map((r: any) => r.role);
      if (roles.includes("super_admin")) setUserRole("super_admin");
      else if (roles.includes("admin")) setUserRole("admin");
      else setUserRole(roles[0]);
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
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userRole,
        orgId,
        isLoading,
        isSuperAdmin: userRole === "super_admin",
        isEcommerce,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};