import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err, info) {
    console.error('[SIP] Render crash:', err, info.componentStack)
  }
  render() {
    if (this.state.err)
      return (
        <div style={{ padding: 24, color: '#f87171', background: '#0a0a0b', minHeight: '100dvh' }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {String(this.state.err)}
          </pre>
        </div>
      )
    return this.props.children
  }
}
