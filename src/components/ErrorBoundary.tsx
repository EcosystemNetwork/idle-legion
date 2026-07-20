// Top-level crash guard.
//
// The app had none, so a single throw anywhere in the tree unmounted the whole
// game and left a blank white page — with the save still sitting safely in
// localStorage and no way for the player to know that.
//
// The reassurance matters more than the styling here: an idle player who sees a
// blank screen assumes their progress is gone. It isn't, and this says so.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card" role="alert">
          <h1>The kingdom stumbled</h1>
          <p>
            Something broke while rendering. <strong>Your save is safe</strong> — it lives in this
            browser and was written before the error.
          </p>
          <pre className="crash-msg">{error.message}</pre>
          <div className="crash-actions">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload the game
            </button>
            <button type="button" className="btn ghost" onClick={() => this.setState({ error: null })}>
              Try to continue
            </button>
          </div>
        </div>
      </div>
    );
  }
}
