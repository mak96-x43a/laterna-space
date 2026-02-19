import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Landing from './pages/Landing';
import ModuleIndex from './pages/ModuleIndex';
import GyromotionModule from './modules/gyromotion/GyromotionModule';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Pages with shared nav shell */}
        <Route element={<App />}>
          <Route index element={<Landing />} />
          <Route path="modules" element={<ModuleIndex />} />
        </Route>
        {/* Simulation modules run fullscreen — no nav shell */}
        <Route path="gyromotion" element={<GyromotionModule />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
