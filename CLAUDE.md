# ORION — instrucciones para Claude Code

## Commits

Usar siempre Conventional Commits:

```
type(scope): descripción en imperativo, minúsculas, sin punto final
```

| Tipo | Cuándo usarlo |
|------|---------------|
| `feat` | nueva funcionalidad |
| `fix` | corrección de bug |
| `docs` | solo documentación |
| `refactor` | cambio interno sin nueva funcionalidad ni fix |
| `test` | agregar o corregir tests |
| `chore` | tareas de mantenimiento (deps, config, scripts) |

Scopes comunes: `router`, `classifier`, `proxy`, `session`, `costs`, `docs`, `ci`

Ejemplos válidos:
- `feat(classifier): add data-analysis pattern for Gemini routing`
- `fix(proxy): handle timeout on Ollama fallback`
- `docs(decisions): add ADR-002 for session storage strategy`

Commits que mezclan múltiples tipos deben dividirse.
