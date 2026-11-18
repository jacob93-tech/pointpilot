import { Component, lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Notice, Spinner, ToastProvider } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Explore } from './pages/Explore';
import { FlightsPoints } from './pages/FlightsPoints';
import { Bonuses } from './pages/Bonuses';
import { Trips } from './pages/Trips';
import { Budget } from './pages/Budget';
import { Settings } from './pages/Settings';

// The map page pulls in Leaflet; load it on demand.
const MapItinerary = lazy(() => import('./pages/MapItinerary').then((m) => ({ default: m.MapItinerary })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <Notice tone="error" title="Something went wrong on this page">
          {this.state.error.message}. Your saved data is safe in this browser. Try reloading.
        </Notice>
      );
    return this.props.children;
  }
}

export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="explore" element={<ErrorBoundary><Explore /></ErrorBoundary>} />
            <Route path="flights" element={<ErrorBoundary><FlightsPoints /></ErrorBoundary>} />
            <Route path="bonuses" element={<ErrorBoundary><Bonuses /></ErrorBoundary>} />
            <Route path="trips" element={<ErrorBoundary><Trips /></ErrorBoundary>} />
            <Route path="trips/:tripId" element={<ErrorBoundary><Trips /></ErrorBoundary>} />
            <Route
              path="itinerary"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<Spinner label="Loading map…" />}>
                    <MapItinerary />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="budget" element={<ErrorBoundary><Budget /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            <Route path="*" element={<Notice title="Page not found">That page doesn’t exist.</Notice>} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
