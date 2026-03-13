import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('spid_token');
    navigate('/login');
  };

  return (
    <div>
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container">
          <span className="navbar-brand fw-bold">SPID Metadata App</span>
          <button
            className="btn btn-outline-light btn-sm"
            onClick={handleLogout}
          >
            Esci
          </button>
        </div>
      </nav>
      <div className="container mt-4">
        <Outlet />
      </div>
    </div>
  );
}

export default Dashboard;
