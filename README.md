# NYC Subway Tracker

A website for live NYC subway information: service status for every line, real-time train arrivals at any station, station search (by name or "near me"), and login with saved favorite stations.

**Stack:** Python + Flask + SQLite (backend) · React + Vite + Tailwind CSS (frontend) · Firebase Authentication (login) · MTA real-time feeds (free, no API key)

## Setup

You need **Python 3.10+** and **Node.js 20+**.

### 1. Backend (terminal 1)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python import_data.py             # one time: builds subway.db from MTA data
python app.py                     # runs on http://localhost:5001
```

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev                       # open http://localhost:5173
```

The frontend forwards every `/api/...` request to the backend, so both need to be running.

### 3. Login (optional)

The site works without this, just without login. To turn it on:

1. Create a project at https://console.firebase.google.com
2. **Build → Authentication → Get started → Email/Password → Enable**
3. **Project settings → Your apps → Add app → Web**, and copy the config values
4. Copy `frontend/.env.example` to `frontend/.env` and paste the values in
5. Restart `npm run dev`

Never commit `.env`; it's already in `.gitignore`.

### Run the tests

```bash
cd backend
source venv/bin/activate
pytest
```

## API

All endpoints return JSON. Errors look like `{ "error": "message" }` with status 400 (bad request), 404 (not found) or 502 (MTA feed down).

| Endpoint | Returns |
|---|---|
| `GET /api/status` | Service status of every line |
| `GET /api/arrivals?station=L03` | Next trains at one station |
| `GET /api/routes` | Every line with its official colors |
| `GET /api/stations?q=union` | Stations whose name matches |
| `GET /api/stations/nearby?lat=40.73&lon=-73.99` | 5 closest stations |

<details>
<summary>Example responses</summary>

`GET /api/status`
```json
{
  "updated_at": 1792875100,
  "lines": [
    {
      "route": "L", "name": "14 St-Canarsie Local",
      "color": "#7C858C", "text_color": "#FFFFFF",
      "status": "Delays",
      "alerts": [{ "type": "Delays", "text": "[L] trains are running with delays..." }]
    }
  ]
}
```
`status` is one of: `Good Service`, `Planned Work`, `Service Change`, `Suspended`, `Delays`.

`GET /api/arrivals?station=L03`
```json
{
  "updated_at": 1792875100,
  "station": { "id": "L03", "name": "14 St-Union Sq", "lat": 40.7348, "lon": -73.9907, "routes": ["L"] },
  "arrivals": [
    {
      "route": "L", "direction": "Northbound", "destination": "8 Av",
      "minutes_away": 3, "arrival_time": 1792875280,
      "color": "#7C858C", "text_color": "#FFFFFF"
    }
  ]
}
```

`GET /api/stations?q=union` (and `/nearby`, which adds `distance_miles`)
```json
{ "stations": [{ "id": "L03", "name": "14 St-Union Sq", "lat": 40.7348, "lon": -73.9907, "routes": ["L"] }] }
```
</details>

## Project structure and who owns what

```
backend/
  app.py              Person 1  Flask app and API endpoints
  mta.py              Person 1  downloads and reads the MTA real-time feeds
  database.py         Person 2  SQLite tables and queries
  import_data.py      Person 2  loads MTA station and route data into SQLite
  tests/test_api.py   Person 5  backend tests
frontend/src/
  components/StatusDashboard.jsx   Person 3  service status dashboard
  components/StationSearch.jsx     Person 3/4  search bar + "near me"
  components/ArrivalCards.jsx      Person 3  train arrival cards
  components/RouteBullet.jsx       Person 3  colored line symbols
  api.js                           Person 3  calls to the backend
  firebase.js                      Person 4  Firebase setup
  components/Login.jsx             Person 4  sign up / log in / log out
  useFavorites.js                  Person 4  saving favorite stations
  components/Favorites.jsx         Person 4  favorites list
  App.jsx                          Person 5  puts all the parts together
```

## Data sources

- Real-time arrivals: MTA GTFS-RT feeds (`api-endpoint.mta.info`)
- Service alerts: MTA subway alerts feed
- Stations and routes: MTA static GTFS (`gtfs_subway.zip`)
