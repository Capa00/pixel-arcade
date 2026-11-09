/** Estensioni presenti in questa cartella (una sottocartella ciascuna, con `index.jsx`). */
import { collect } from './registry.js'

export const addons = collect(import.meta.glob('./*/index.jsx', { eager: true }))
