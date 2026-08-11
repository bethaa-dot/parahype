import React from 'react';

export default function Layout({ children }) {
  return (
    <div className="app-root">
      <header className="app-header">
        <h1>ParaHype</h1>
        <p className="subtitle">Parallel-play AI buddy for ADHD and neurodivergent leaders.</p>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
