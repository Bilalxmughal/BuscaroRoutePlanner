// src/context/RoutesContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  fetchAllRoutes, addRouteGroup,
  updateRouteGroup, deleteRouteGroup
} from '../firebase/routesService'

const RoutesContext = createContext(null)

export function RoutesProvider({ children }) {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllRoutes()
      setRoutes(data)
    } catch (e) {
      setError('Firebase se data load nahi hua. Config check karein.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRoute = async (data) => {
    const id = await addRouteGroup(data)
    await load()
    return id
  }

  const updateRoute = async (id, data) => {
    await updateRouteGroup(id, data)
    await load()
  }

  const deleteRoute = async (id) => {
    await deleteRouteGroup(id)
    setRoutes(prev => prev.filter(r => r.id !== id))
  }

  return (
    <RoutesContext.Provider value={{ routes, loading, error, addRoute, updateRoute, deleteRoute, reload: load }}>
      {children}
    </RoutesContext.Provider>
  )
}

export const useRoutes = () => useContext(RoutesContext)