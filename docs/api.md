# API
Base URL: http://localhost:3000

## Assignments

POST /assignments/run
- spustí alokaci oddělení

POST /assignments/move
- manuální přesun oddělení do patra

DELETE /assignments/:deptId/placement
- odebere oddělení z aktuální mapy rozmístění

POST /assignments/clear
- smaže aktuální alokace oddělení

## Buildings

GET /buildings
- seznam budov

POST /buildings
- založení budovy
- Body: { "id": 1, "name": "Budova A" }

PUT /buildings/:id
- úprava budovy (např. změna názvu)

DELETE /buildings/:id
- smaže budovu

GET /buildings/:id/floors
- seznam pater v konkrétní budově

POST /buildings/:id/floors
- přidání patra k budově
- Body: { "level": 0, "capacity": 20 }

## Departments

GET /departments
- seznam oddělení včetně informací o lidech a spolupracujících odděleních

POST /departments
- vytvoření nového oddělení
- Body: 
{
"id": 4,
"name": "Design",
"collaboratesWithId": 3
}

PUT /departments/:id
- úprava oddělení (např. přejmenování)

POST /departments/:id/collaboration
- nastavení nebo změna spolupracujícího oddělení
- Body: { "collaboratesWithId": 1 }

DELETE /departments/:id
- odstranění oddělení

## Floors

PUT /floors/:id
- úprava kapacity patra

DELETE /floors/:id
- smazání patra

## Map

GET /map
- vypíše všechny budovy, jejich patra, kapacity, usazená oddělení a neusazená oddělení

GET /map/:buildingId
- detail jedné budovy a neusazené oddělení

## Persons

GET /persons
- seznam všech zaměstnanců a jejich aktuální oddělení

POST /persons
- vytvoření nové osoby

PUT /persons/:id/department
- přiřazení osoby do oddělení

DELETE /persons/:id
- smazání osoby

## Utilities

GET /health
- health check API a ověření připojení k databázi