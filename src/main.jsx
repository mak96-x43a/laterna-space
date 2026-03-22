import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Landing from './pages/Landing';
import ModuleIndex from './pages/ModuleIndex';
import GyromotionModule from './modules/gyromotion/GyromotionModule';
import './index.css';
import DCDischargeModule from './virtual_labs/DC_discharge/DCDischargeModule';
import VirtualLabIndex from './pages/VirtualLabIndex';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Pages with shared nav shell */}
        <Route element={<App />}>
          <Route index element={<Landing />} />
          <Route path="modules" element={<ModuleIndex />} />
          <Route path="virtual-labs" element={<VirtualLabIndex />} />
        </Route>
        {/* Simulation modules run fullscreen — no nav shell */}
        <Route path="gyromotion" element={<GyromotionModule />} />
        <Route path="dc-discharge" element={<DCDischargeModule />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
