// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RoutesProvider } from './context/RoutesContext'
import Layout from './components/Layout/Layout'
import Dashboard from './pages/Dashboard'
import RoutesPage from './pages/Routes'
import RouteBuilder from './pages/RouteBuilder'
import MapView from './pages/MapView'
import './styles/global.css'

export default function App() {
  return (
    <BrowserRouter>
      <RoutesProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/routes/new" element={<RouteBuilder />} />
            <Route path="/routes/edit/:id" element={<RouteBuilder />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/map/:id" element={<MapView />} />
          </Route>
        </Routes>
      </RoutesProvider>
    </BrowserRouter>
  )
}