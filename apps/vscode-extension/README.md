# md-business for VS Code

Markdown-first business documents (invoice / spec / test-spec / db-spec / api-spec) in VS Code.

> v0.1.0 is under construction. Planned for this version:
>
> - Schema validation of the frontmatter, shown in the Problems panel
> - Preview of invoice / spec layouts in a side panel
> - The md-business MCP tools, registered for agent mode

## Development

```bash
pnpm --filter md-business-vscode test:run
pnpm --filter md-business-vscode package   # builds md-business-<version>.vsix
```

## License

MIT
