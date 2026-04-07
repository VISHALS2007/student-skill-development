import React from "react";

// Simple error boundary to avoid white screens from runtime errors
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App crashed", error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md w-full rounded-2xl border border-rose-100 bg-white shadow-lg p-6 space-y-4 text-center">
            <div className="text-3xl">⚠️</div>
            <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
            <p className="text-sm text-slate-600">We hit an unexpected error while rendering the dashboard. Try reloading the page.</p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
