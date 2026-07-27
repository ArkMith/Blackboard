import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Wraps the app so a crash during render shows the actual error on-screen
// instead of silently leaving a blank window with no clue what happened.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[blackboard] uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen bg-[#07090e] text-slate-300 font-mono text-xs p-6 flex flex-col gap-3 overflow-auto">
          <div className="text-rose-400 font-bold text-sm">Blackboard crashed while rendering.</div>
          <div className="text-slate-400">
            This is the real error — screenshot or copy this instead of a blank window.
          </div>
          <pre className="bg-black/40 border border-rose-900/40 rounded p-3 whitespace-pre-wrap text-rose-300">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="self-start px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}