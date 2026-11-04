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
        <div className="chip-rose rounded-2xl p-4 text-xs flex items-center justify-between my-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>Something broke in this card. Other features remain operational.</span>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-inverse/[0.08] hover:bg-inverse/[0.14] px-2.5 py-1 rounded-lg text-[10px] font-medium transition"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
