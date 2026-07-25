import React from 'react'
import { ExternalLink, ShieldCheck, X } from 'lucide-react'
import type { SourceReference } from '../api/realRaiseContract'

interface SourceDrawerProps {
  isOpen: boolean
  onClose: () => void
  sources: SourceReference[]
}

export const SourceDrawer: React.FC<SourceDrawerProps> = ({ isOpen, onClose, sources }) => {
  if (!isOpen) return null

  return (
    <div className="drawer-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-icon-tag">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h3>公开统计数据依据</h3>
              <p className="drawer-subtitle">本项目不凭空假定，所有比对数据均来自于公开权威渠道</p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="关闭数据来源窗口">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content">
          <div className="source-banner">
            <span className="source-banner-badge">口径说明</span>
            <p>
              真实房租支出优先取自您输入的设定值；下方宏观统计数据是全国 2025 年 CPI 与城镇消费结构基准，不替代个人实际支出，也不代表某个城市的租金变化。
            </p>
          </div>

          <div className="source-list">
            {sources.length === 0 ? (
              <p className="empty-sources">暂无关联的数据来源记录</p>
            ) : (
              sources.map((src, idx) => (
                <div className="source-card" key={idx}>
                  <div className="source-card-header">
                    <span className="source-index">0{idx + 1}</span>
                    <h4 className="source-name">{src.name}</h4>
                  </div>
                  <div className="source-card-meta">
                    <span className="meta-chip">年份: {src.year ?? '通用'}</span>
                    <span className="meta-chip">范围: {src.scope}</span>
                  </div>
                  {src.url && (
                    <a
                      className="source-link"
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看统计发布来源 <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="drawer-footer">
          <span>REAL RAISE DATA PROTOCOL · 确定性计算底座</span>
          <button className="drawer-confirm-btn" onClick={onClose}>
            了解并返回
          </button>
        </div>
      </div>
    </div>
  )
}
