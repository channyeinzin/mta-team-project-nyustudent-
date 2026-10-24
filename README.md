# NYC Subway Tracker

A website for live NYC subway information: a live map of every line, station and train, service status for every line, real-time train arrivals at any station, station search (by name or "near me"), a trip planner (start → destination, with up to one transfer), and login with saved favorite stations.

**Stack:** Python + Flask + SQLite (backend) · React + Vite + Tailwind CSS + Leaflet (frontend) · Firebase Authentication (login) · MTA real-time feeds (free, no API key)

## Team

| Role | Name | GitHub |
|---|---|---|
| Person 1: MTA API & Backend | | |
| Person 2: Database & Project Setup | | |
| Person 3: Frontend & Dashboard | | |
| Person 4: Firebase & Transit Features | | |
| Person 5: Integration & Presentation | | |

## How to contribute

1. Create a branch: `git checkout -b your-name/what-you-change`
2. Make your change, then `git add .` and `git commit -m "Short description"`
3. Push: `git push -u origin your-name/what-you-change`
4. Open a Pull Request on GitHub, and Person 5 reviews and merges it

Never commit `.env` files or any keys or passwords.

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
| `GET /api/trip?from=L08&to=A27` | Next trips between two stations: direct or one transfer, soonest arrival first |
| `GET /api/subway/routes` | Every line's track, GeoJSON (cached 24h) |
| `GET /api/subway/stops` | Every station, GeoJSON (cached 24h) |
| `GET /api/subway/trains?routes=1,2,3` | Live trains, GeoJSON; leave out `routes` for all lines |

On the map, each train is drawn at its **next station**, not between stations, to keep the code simple.

<details>
<summary>How the trip planner works</summary>

It uses the live train data, not the timetable:
1. **Direct:** find trains that stop at the start and *later* at the destination.
2. **One transfer:** ride train 1 to any later station, walk to a connected platform if needed (walk times come from MTA's `transfers.txt`), and catch a train 2 that leaves after you get there and goes to the destination.
3. Sort by arrival time. Show the next 3 trains for each direct line and the best trip for each transfer combination.

Limits: at most one transfer, and only trains already in the live feed (about the next 30–60 minutes).
</details>

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
  components/SubwayMap.jsx         Person 3  live map (lines, stations, trains)
  components/StatusDashboard.jsx   Person 3  service status dashboard
  components/StationSearch.jsx     Person 3/4  search bar + "near me"
  components/ArrivalCards.jsx      Person 3  train arrival cards
  components/RouteBullet.jsx       Person 3  colored line symbols
  api.js                           Person 3  calls to the backend
  firebase.js                      Person 4  Firebase setup
  components/TripPlanner.jsx       Person 4  trip planner (from / to / 📍)
  components/Login.jsx             Person 4  sign up / log in / log out
  useFavorites.js                  Person 4  saving favorite stations
  components/Favorites.jsx         Person 4  favorites list
  App.jsx                          Person 5  puts all the parts together
```

## Data sources

- Real-time arrivals: MTA GTFS-RT feeds (`api-endpoint.mta.info`)
- Service alerts: MTA subway alerts feed
- Stations, routes and track shapes: MTA static GTFS (`gtfs_subway.zip`)
- Background map: OpenStreetMap tiles
