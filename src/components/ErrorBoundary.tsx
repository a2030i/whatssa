import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[300px] flex items-center justify-center p-6" dir="rtl">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "حاول تحديث الصفحة أو التواصل مع الدعم الفني"}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.handleReset} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 ml-1" />
                إعادة المحاولة
              </Button>
              <Button onClick={() => window.location.reload()} size="sm">
                تحديث الصفحة
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

