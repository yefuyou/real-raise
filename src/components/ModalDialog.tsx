import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
}

/**
 * 居中模态框：给内容较长、又只是"编辑一次"的面板用，避免把主表单撑得很长。
 * 与 SourceDrawer 共用同一层遮罩语言，但走居中而不是侧边抽屉。
 */
export const ModalDialog: React.FC<ModalDialogProps> = ({ isOpen, onClose, title, subtitle, children }) => {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      const timer = setTimeout(() => closeBtnRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
    previousFocusRef.current?.focus()
    return undefined
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    // 弹窗打开时锁背景滚动，否则滚轮会穿透到底层表单。
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-container" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 id="modal-title">{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button ref={closeBtnRef} type="button" className="modal-close-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
