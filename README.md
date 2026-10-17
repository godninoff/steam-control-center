# Steam Control Center — MFE prototype

React + TypeScript + Tailwind + Vite + Module Federation. Two simple microfrontends: TF2 market history and item transfer between accounts. MVVM separation, small repository/adapters, no real Steam credentials or API calls yet.

## Run

```bash
pnpm install
pnpm dev
```

Shell: http://localhost:3000  |  Market: http://localhost:3001  |  Transfer: http://localhost:3002

The Steam integration is intentionally mocked. Real Steam adapters can be added later behind repository/service interfaces.
