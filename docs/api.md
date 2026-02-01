# API (draft)
Base URL: http://localhost:3000

## Buildings
- POST /buildings
- GET  /buildings
- POST /buildings/:id/floors
- GET  /buildings/:id/floors

## Departments
- POST /departments
- GET  /departments
- POST /departments/:id/cooperations
- POST /departments/:id/lock
- DELETE /departments/:id/lock

## Scenarios
- POST /scenarios
- GET  /scenarios/:id
- POST /scenarios/:id/run

## Utilities
- GET /health
- POST /seed (demo data)
