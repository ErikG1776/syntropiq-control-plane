"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <Card className="p-5 space-y-3">
          <div className="text-sm font-medium text-destructive">
            Something went wrong
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            Try Again
          </Button>
        </Card>
      )
    }

    return this.props.children
  }
}
