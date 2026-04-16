import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient.js';

export default function HabitsPanel() {
  const [habits, setHabits] = useState([]);

  useEffect(() => {
    apiClient.get('/habits').then(res => setHabits(res.data));
  }, []);

  const toggleHabit = async (id) => {
    const res = await apiClient.post(`/habits/${id}/toggle`);
    setHabits(res.data);
  };

  return (
    <div className="card">
      <h2>Habits</h2>
      <ul>
        {habits.map(habit => (
          <li key={habit._id}>
            <label>
              <input
                type="checkbox"
                checked={habit.completedToday}
                onChange={() => toggleHabit(habit._id)}
              />
              {habit.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
