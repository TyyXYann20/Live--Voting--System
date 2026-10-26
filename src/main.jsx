import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="empty">
          <h1>Something interrupted your event.</h1>
          <p>
            Reload the page to reconnect. Your submitted vote remains safely
            recorded.
          </p>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
