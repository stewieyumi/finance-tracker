import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-rose-950/20 border border-rose-800/40 rounded-2xl p-4 text-xs text-rose-300 flex items-center justify-between my-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>Something broke in this card. Other features remain operational.</span>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-rose-900/50 hover:bg-rose-800/50 px-2.5 py-1 rounded-lg text-rose-200 text-[10px] font-medium transition"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
