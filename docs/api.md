# API
Base URL: http://localhost:3000

## Assignments

POST /assignments/run
- spustí alokaci oddělení

POST /assignments/move
- manuální přesun oddělení do patra

POST /assignments/clear
- smaže aktuální alokace oddělení

## Buildings

GET /buildings
- seznam budov

POST /buildings
- založení budovy
- Body: { "id": 1, "name": "Budova A" }

DELETE /buildings/:id
- smaže budovu

GET /buildings/:id/floors
- seznam pater v konkrétní budově

POST  /buildings/:id/floors
- přidání patra k budově
- Body: {"level": 0, "capacity": 20}

## Departments

GET  /departments
- seznam oddělení včetně informací o lidech a spolupracujících odděleních

POST /departments
- vytvoření nového oddělení
- Body: 
{
"id": 4,
"name": "Design",
"collaboratesWithId": 3
}

POST /departments/:id/collaboration
- nastavení nebo změna spolupracujícího oddělení
- Body: { "collaboratesWithId": 1 }



## Scenarios
POST /scenarios
GET  /scenarios/:id
POST /scenarios/:id/run

## Utilities
GET /health
