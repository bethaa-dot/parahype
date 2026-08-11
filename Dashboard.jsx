import React from 'react';
import ParallelPlay from './ParallelPlay.jsx';
import HabitsPanel from './HabitsPanel.jsx';
import HypePanel from './HypePanel.jsx';
import AICoach from './AICoach.jsx';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <section className="dashboard-main">
        <ParallelPlay />
        <AICoach />
      </section>
      <aside className="dashboard-side">
        <HabitsPanel />
        <HypePanel />
      </aside>
    </div>
  );
}
