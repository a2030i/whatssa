import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface WhiteLabelBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  foreground_color: string;
  custom_domain: string | null;
  support_email: string | null;
  support_phone: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  is_default: boolean;
}

interface WhiteLabelContextType {
  brand: WhiteLabelBrand | null;
  loading: boolean;
  isWhiteLabel: boolean;
  platformName: string;
}

const defaultBrand: WhiteLabelBrand = {
  id: "",
  name: "Respondly",
  slug: "respondly",
  logo_url: null,
  favicon_url: null,
  primary_color: "#25D366",
  secondary_color: "#128C7E",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  foreground_color: "#1a1a2e",
  custom_domain: null,
  support_email: null,
  support_phone: null,
  privacy_policy_url: null,
  terms_url: null,
  is_default: false,
};

const WhiteLabelContext = createContext<WhiteLabelContextType>({
  brand: defaultBrand,
  loading: false,
  isWhiteLabel: false,
  platformName: "Respondly",
});

export const useWhiteLabel = () => useContext(WhiteLabelContext);

// Convert hex to HSL for CSS variables
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrandCssVars(brand: WhiteLabelBrand) {
  const root = document.documentElement;
  root.style.setProperty("--primary", hexToHsl(brand.primary_color));
  root.style.setProperty("--primary-foreground", hexToHsl("#ffffff"));

  // Update favicon if set
  if (brand.favicon_url) {
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (link) link.href = brand.favicon_url;
  }

  // Update page title
  document.title = brand.name;
}

export const WhiteLabelProvider = ({ children }: { children: ReactNode }) => {
  const [brand, setBrand] = useState<WhiteLabelBrand>(defaultBrand);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    const loadBrand = async () => {
      setLoading(true);
      try {
        // Try to detect by custom domain first
        const currentHost = window.location.hostname;
        
        // Check if user has a partner via their org
        if (profile?.org_id) {
          const { data: org } = await supabase
            .from("organizations")
            .select("partner_id")
            .eq("id", profile.org_id)
            .single();

          if (org?.partner_id) {
            const { data: partner } = await supabase
              .from("white_label_partners")
              .select("*")
              .eq("id", org.partner_id)
              .eq("is_active", true)
              .single();

            if (partner) {
              setBrand(partner as WhiteLabelBrand);
              applyBrandCssVars(partner as WhiteLabelBrand);
              setLoading(false);
              return;
            }
          }
        }

        // Try domain-based detection for login page
        const { data: domainPartner } = await supabase
          .from("white_label_partners")
          .select("*")
          .eq("custom_domain", currentHost)
          .eq("is_active", true)
          .maybeSingle();

        if (domainPartner) {
          setBrand(domainPartner as WhiteLabelBrand);
          applyBrandCssVars(domainPartner as WhiteLabelBrand);
        } else {
          // Use Respondly as fallback
          const { data: respondlyP } = await supabase
            .from("white_label_partners")
            .select("*")
            .eq("slug", "respondly")
            .maybeSingle();

          if (respondlyP) {
            setBrand(respondlyP as WhiteLabelBrand);
            applyBrandCssVars(respondlyP as WhiteLabelBrand);
          }
        }
      } catch {
        // Use default brand on error
      } finally {
        setLoading(false);
      }
    };

    loadBrand();
  }, [profile?.org_id]);

  return (
    <WhiteLabelContext.Provider
      value={{
        brand,
        loading,
        isWhiteLabel: !brand.is_default,
        platformName: brand.name,
      }}
    >
      {children}
    </WhiteLabelContext.Provider>
  );
};
