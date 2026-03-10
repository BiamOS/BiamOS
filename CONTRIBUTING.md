# Contributing to BiamOS

Thank you for your interest in contributing to BiamOS! This guide will help you get started.

## Development Setup

```bash
# Clone and install
git clone https://github.com/your-org/biamos.git
cd biamos
npm install

# Run in dev mode
npm run dev          # Browser (backend + frontend)
npm run electron     # Desktop (Electron)

# Run tests
npm test
```

## Project Standards

### Code Style

- **TypeScript**: Strict mode enabled — no `any` casts without justification
- **Formatting**: Prettier (run `npm run format`)
- **Linting**: ESLint (run `npm run lint`)
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/components
- **Files**: `kebab-case.ts` for modules, `PascalCase.tsx` for React components

### Architecture Principles

- **SOLID**: Single Responsibility — one concern per file (< 700 LOC target)
- **DRY**: Extract shared logic into utility modules
- **Barrel exports**: Use `index.ts` for public module APIs
- **Error handling**: Always catch and log errors with `[Domain]` prefix

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(pipeline): add embedding fallback to router
fix(canvas): prevent layout thrashing during drag
refactor(routes): split integration-routes into sub-modules
docs: update README architecture diagram
```

## Submitting Changes

1. **Fork** the repository
2. **Create** a feature branch from `main`
3. **Make** your changes following the standards above
4. **Test** — ensure `npm test` passes (8/10 baseline)
5. **Submit** a Pull Request with a clear description

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
