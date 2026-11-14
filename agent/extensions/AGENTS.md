## Workspace
- The parent repo contains the user's pi agent configuration. This directory is for extensions. Each extension = a workspace subdir with its entry file listed under `pi.extensions` in `./package.json`.
- Activate: add to `pi.extensions`. Deactivate: remove it (dir may be renamed with `_unused-` prefix).
- After any change, run `npm run check` (biome + tsgo typecheck).

## Code comments
- Only comment code that isn't obvious or requires context. Use code comments sparingly
