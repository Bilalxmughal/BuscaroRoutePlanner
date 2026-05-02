// src/firebase/routesService.js
import {
  collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, orderBy, query, serverTimestamp
} from 'firebase/firestore'
import { db } from './config'

const COL = 'routeGroups'

export async function fetchAllRoutes() {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addRouteGroup(data) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp()
  })
  return ref.id
}

export async function updateRouteGroup(id, data) {
  const ref = doc(db, COL, id)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function deleteRouteGroup(id) {
  await deleteDoc(doc(db, COL, id))
}