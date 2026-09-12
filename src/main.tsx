import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DebugInspector } from './components/Debug/DebugInspector.tsx';

function Root() {
  const isDebugUrl = () => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.toLowerCase();
    return hash === '#/debug' || hash === '#debug' || window.location.search.includes('debug=true');
  };

  const [isDebug, setIsDebug] = useState(isDebugUrl());

  useEffect(() => {
    const handleHashChange = () => {
      setIsDebug(isDebugUrl());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isDebug) {
    return <DebugInspector />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
