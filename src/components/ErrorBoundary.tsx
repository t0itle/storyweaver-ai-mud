import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

// Catches render-time crashes anywhere in the app and shows an in-world
// recovery screen instead of a blank page.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ash p-6 text-center bg-background">
        <div className="text-5xl">✶</div>
        <h1 className="font-display text-2xl text-parchment">The weave frayed</h1>
        <p className="max-w-md text-sm">
          Something in the world broke mid-step. Your character and progress are safe on the server —
          only this window lost its footing.
        </p>
        <p className="font-mono text-[10px] text-ash/60 max-w-md break-all">{this.state.error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-ember underline underline-offset-4"
        >
          Step back onto the road
        </button>
      </div>
    );
  }
}
