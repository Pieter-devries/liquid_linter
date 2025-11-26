# LookML Liquid Linter

A web-based tool and API for linting Liquid syntax within LookML, with Looker-specific checks.

## Features
- **Real-time Linting**: Web UI for checking Liquid syntax.
- **Looker-specific Tags**: Supports `{% parameter %}`, `{% condition %}`, etc.
- **Comprehensive Parameter Validation**: Validates variable usage based on LookML parameter (e.g., `html`, `label`, `sql`).
- **API Access**: REST API for large-scale testing.
- **Automated Testing**: Includes a test suite with 110+ cases.

## Installation
```bash
npm install
```

## Running the Web UI
```bash
npm run dev
```

## Running the API Server
```bash
node server.js
```

## Running Tests
```bash
node test.js
```
