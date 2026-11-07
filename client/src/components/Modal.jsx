import Icon from './Icon.jsx'
import { mdiClose } from '@mdi/js'

export default function Modal({ onClose, title, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3" onMouseDown={onClose}>
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto card !m-0 animate-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="btn-secondary !p-2" title="Cerrar" aria-label="Cerrar">
            <Icon path={mdiClose} size={0.9} />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}