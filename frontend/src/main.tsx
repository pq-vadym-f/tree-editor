import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TreeEditor } from './features/tree/TreeEditor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TreeEditor />
  </StrictMode>,
)
