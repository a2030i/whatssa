import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ThemeToggle = () => {
  const { theme, toggle } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-secondary text-muted-foreground hover:text-foreground"
          aria-label="تبديل الوضع"
        >
          {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
      </TooltipContent>
    </Tooltip>
  );
};

export default ThemeToggle;
