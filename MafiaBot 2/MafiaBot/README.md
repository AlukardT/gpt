# MafiaBot Web + API

## Quick deploy to Render

1. Create a new repo and push this folder contents (`MafiaBot` directory).
2. Add a file `render.yaml` (already included).
3. On Render:
   - New + -> Blueprint -> select your repo
   - Confirm creation of the Web Service and Postgres
4. Wait for build and deploy.

### Environment variables
- DATABASE_URL (connected automatically from Render Postgres)
- ADMIN_TOKEN=admin-secret
- BOT_TOKEN_INTERNAL=bot-secret
- NODE_ENV=production
- Optional for bot integration: BOT_TOKEN, ADMIN_TELEGRAM_ID

### Start command
- `node main-server.js`

After deploy, open:
- Web UI: https://<render-service-url>/balagan/
- Health test: https://<render-service-url>/api/test (Authorization: Bearer admin-secret)