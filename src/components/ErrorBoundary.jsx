import { Component } from 'react'
import { logger } from '../utils/logger'
import { reportError, captureAppState } from '../services/errorReporter'
import { STORAGE_KEYS } from '../constants/storageKeys'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null, reporting: false, reportResult: null, userNote: '' }
    this._latestComponentStack = undefined
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err, info) {
    logger.error('error-boundary', 'Render crash:', err, info.componentStack)
    this._latestComponentStack = info.componentStack
  }
  _getComponentStack = () => this._latestComponentStack
  _handleReport = async () => {
    const { err } = this.state
    if (!err) return
    this.setState({ reporting: true })
    const result = await reportError({
      message: err.message,
      stack: err.stack || '',
      componentStack: this._getComponentStack(),
      tab: localStorage.getItem(STORAGE_KEYS.SIP_ACTIVE_TAB) || undefined,
      userNote: this.state.userNote,
      appStateSnapshot: captureAppState(),
    })
    this.setState({ reporting: false, reportResult: result })
  }
  _handleReload = () => {
    window.location.reload()
  }
  render() {
    if (this.state.err)
      return (
        <div style={{ padding: 24, color: '#f87171', background: '#0a0a0b', minHeight: '100dvh' }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {String(this.state.err)}
          </pre>
          <textarea
            placeholder="What were you doing when this happened? (optional)"
            value={this.state.userNote}
            onChange={(e) => this.setState({ userNote: e.target.value })}
            style={{
              width: '100%',
              marginTop: 12,
              background: '#1a1a1d',
              color: '#e5e5e5',
              border: '1px solid #333',
              borderRadius: 6,
              padding: 8,
              minHeight: 60,
              fontSize: 13,
            }}
          />
          <div style={{ marginTop: 12 }}>
            {this.state.reportResult ? (
              this.state.reportResult.success ? (
                <span style={{ color: '#4ade80' }}>
                  Report submitted (#{this.state.reportResult.issueIdentifier}). Thank you!
                </span>
              ) : (
                <span style={{ color: '#fb923c' }}>Report failed. Please try again.</span>
              )
            ) : (
              <button
                onClick={this._handleReport}
                disabled={this.state.reporting}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  marginRight: 8,
                }}
              >
                {this.state.reporting ? 'Sending...' : 'Report to Developer'}
              </button>
            )}
            <button
              onClick={this._handleReload}
              style={{
                padding: '8px 16px',
                background: '#374151',
                color: '#e5e5e5',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      )
    return this.props.children
  }
}
