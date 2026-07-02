import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

const MANAGER_SESSION_KEYS = [
  'managerToken',
  'managerUsername',
  'managerName',
  'managerRole',
  'managerPhone',
  'managerEmail',
]

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ManagerErrorBoundary] Unhandled render error', error, info.componentStack)
  }

  private reloadPage = () => {
    window.location.reload()
  }

  private goToLogin = () => {
    for (const key of MANAGER_SESSION_KEYS) {
      window.localStorage.removeItem(key)
    }
    window.location.assign('/')
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <section
          style={{
            width: '100%',
            maxWidth: '520px',
            padding: '28px',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            background: '#ffffff',
            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.08)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '24px', lineHeight: 1.25 }}>Что-то пошло не так</h1>
          <p style={{ margin: '12px 0 0', color: '#475569', lineHeight: 1.6 }}>
            Интерфейс менеджера столкнулся с ошибкой. Обновите страницу или вернитесь на страницу входа.
          </p>

          {import.meta.env.DEV ? (
            <details style={{ marginTop: '20px', color: '#475569' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Детали ошибки</summary>
              <pre
                style={{
                  margin: '12px 0 0',
                  padding: '12px',
                  overflow: 'auto',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {error.stack || error.message}
              </pre>
            </details>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={this.reloadPage}
              style={{
                minHeight: '42px',
                padding: '0 18px',
                border: 0,
                borderRadius: '8px',
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              Обновить страницу
            </button>
            <button
              type="button"
              onClick={this.goToLogin}
              style={{
                minHeight: '42px',
                padding: '0 18px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 700,
              }}
            >
              На страницу входа
            </button>
          </div>
        </section>
      </main>
    )
  }
}
