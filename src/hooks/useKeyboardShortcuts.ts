import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Global keyboard shortcuts for the platform.
 * 
 * Shortcuts:
 *  Ctrl+1 → Dashboard
 *  Ctrl+2 → Inbox
 *  Ctrl+3 → Campaigns
 *  Ctrl+4 → Analytics
 *  Ctrl+K → Focus search (if on inbox)
 *  Ctrl+N → New conversation (if on inbox)
 *  Escape → Close modals / deselect
 */
const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input/textarea
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if ((e.target as HTMLElement)?.contentEditable === "true") return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl) {
      switch (e.key) {
        case "1":
          e.preventDefault();
          navigate("/dashboard");
          break;
        case "2":
          e.preventDefault();
          navigate("/inbox");
          break;
        case "3":
          e.preventDefault();
          navigate("/campaigns");
          break;
        case "4":
          e.preventDefault();
          navigate("/analytics");
          break;
      }
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;
