# NYC Subway Tracker

Live NYC subway information in one website: see every train on a map, check if your line is running, find out when the next train arrives, and plan a trip.

Built as an NYU team project using free MTA real-time data (no API key needed).

## The idea

Riding the NYC subway usually means checking several places: one app for delays, another for the next train, a map to see which line goes where. The MTA publishes all of this as live data, but it's raw and hard to read.

Our idea was to put it all in **one simple website**. Open it and you can see:

- **Is my line running?** Every line's status, with the MTA's alert text.
- **When is my train coming?** Search a station and see the next trains in minutes.
- **Where are the trains right now?** A live map of every line and train.
- **How do I get there?** Pick a start and destination and get the next trips, including one transfer.

Logged-in users can save their favorite stations, so their daily stops are one click away.

**How it fits together:** the Python backend downloads the MTA's live feeds (refreshed every 30 seconds), turns them into clean JSON, and looks up stations in a SQLite database. The React frontend shows that data as a map, cards and lists. Firebase handles accounts and saved favorites.

```
MTA live feeds ──► Flask backend (+ SQLite stations) ──► React website ◄──► Firebase (login, favorites)
```

## Features

- **Live map**: every subway line, station and train, updated in real time
- **Service status**: Good Service, Delays, Planned Work, Service Change or Suspended for every line
- **Train arrivals**: the next trains at any station, in minutes
- **Station search**: by name, or find the closest stations with "near me"
- **Trip planner**: pick a start and destination (or use your current location) and get the next trains, with up to one transfer
- **Favorites**: log in to save the stations you use most

## Built with

| Part | Tools |
|---|---|
| Backend | Python, Flask, SQLite |
| Frontend | React, Vite, Tailwind CSS, Leaflet |
| Login and favorites | Firebase Authentication |
| Data | MTA GTFS real-time feeds and static GTFS |

## How to run it

The app has two parts that run at the same time: the **backend** (Python) and the **frontend** (website). You'll use two terminal windows, one for each.

### What you need first

- **Python 3.10 or newer**: check with `python3 --version` (download from https://www.python.org)
- **Node.js 20 or newer**: check with `node --version` (download from https://nodejs.org)
- **Git**: check with `git --version`

### Step 1: Download the project

```bash
git clone https://github.com/channyeinzin/mta-team-project-nyustudent-.git
cd mta-team-project-nyustudent-
```

### Step 2: Start the backend (terminal 1)

```bash
cd backend
python3 -m venv venv              # make a private Python environment
source venv/bin/activate          # turn it on (Windows: venv\Scripts\activate)
pip install -r requirements.txt   # install Flask and the other libraries
python import_data.py             # first time only (~1 min): downloads MTA station data into subway.db
python app.py                     # start the server
```

Leave this terminal open. You should see it running on http://localhost:5001.

### Step 3: Start the website (terminal 2)

Open a **new** terminal in the project folder, then:

```bash
cd frontend
npm install                       # first time only: install the website's libraries
npm run dev                       # start the website
```

### Step 4: Open it

Go to **http://localhost:5173** in your browser. The map, status, arrivals, search and trip planner all work right away.

**Next time**, you only need `source venv/bin/activate` and `python app.py` in terminal 1, and `npm run dev` in terminal 2.

### If something doesn't work

- **The page loads but shows no data:** the backend isn't running. Check terminal 1.
- **`python3` or `npm` not found:** install Python or Node.js (see "What you need first").
- **Port already in use:** a copy is already running. Close the old terminal, or stop it with Ctrl+C.

### Optional: turn on login and favorites

Everything except login and favorites works without this step.

1. Create a project at https://console.firebase.google.com
2. Go to **Build → Authentication → Get started → Email/Password → Enable**
3. Go to **Project settings → Your apps → Add app → Web** and copy the config values
4. Copy `frontend/.env.example` to `frontend/.env` and paste the values in
5. Restart `npm run dev`

### Run the tests

```bash
cd backend
source venv/bin/activate
pytest
```

## Team

| Role | Name | GitHub |
|---|---|---|
| Person 1: MTA API & Backend | | |
| Person 2: Database & Project Setup | | |
| Person 3: Frontend & Dashboard | | |
| Person 4: Firebase & Transit Features | | |
| Person 5: Integration & Presentation | | |

## How to contribute

1. Get the latest code: `git checkout main && git pull`
2. Make a branch: `git checkout -b your-name/what-you-change`
3. Make your change, then commit it: `git add .` and `git commit -m "Short description"`
4. Push it: `git push -u origin your-name/what-you-change`
5. Open a Pull Request on GitHub. Person 5 reviews and merges it.

Never commit `.env` files, keys or passwords. `.env` is already in `.gitignore`.

## Project structure

```
backend/
  app.py              Person 1    Flask app and API endpoints
  mta.py              Person 1    downloads and reads the MTA real-time feeds
  database.py         Person 2    SQLite tables and queries
  import_data.py      Person 2    loads MTA station and route data into SQLite
  tests/test_api.py   Person 5    backend tests

frontend/src/
  App.jsx                          Person 5    puts all the parts together
  api.js                           Person 3    calls to the backend
  components/SubwayMap.jsx         Person 3    live map (lines, stations, trains)
  components/StatusDashboard.jsx   Person 3    service status
  components/ArrivalCards.jsx      Person 3    train arrival cards
  components/RouteBullet.jsx       Person 3    colored line symbols
  components/StationSearch.jsx     Person 3/4  search bar and "near me"
  components/TripPlanner.jsx       Person 4    trip planner
  components/Login.jsx             Person 4    sign up, log in, log out
  components/Favorites.jsx         Person 4    favorite stations list
  useFavorites.js                  Person 4    saving favorite stations
  firebase.js                      Person 4    Firebase setup
```

## API

All endpoints return JSON. Errors look like `{ "error": "message" }` with status 400 (bad request), 404 (not found) or 502 (MTA feed down).

| Endpoint | Returns |
|---|---|
| `GET /api/status` | Service status of every line |
| `GET /api/arrivals?station=L03` | Next trains at one station |
| `GET /api/routes` | Every line with its official colors |
| `GET /api/stations?q=union` | Stations whose name matches |
| `GET /api/stations/nearby?lat=40.73&lon=-73.99` | The 5 closest stations |
| `GET /api/trip?from=L08&to=A27` | Next trips between two stations, soonest arrival first |
| `GET /api/subway/routes` | Track of every line, as GeoJSON (cached 24h) |
| `GET /api/subway/stops` | Every station, as GeoJSON (cached 24h) |
| `GET /api/subway/trains?routes=1,2,3` | Live trains as GeoJSON; leave out `routes` for all lines |

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

`GET /api/stations?q=union` (`/nearby` returns the same plus `distance_miles`)
```json
{ "stations": [{ "id": "L03", "name": "14 St-Union Sq", "lat": 40.7348, "lon": -73.9907, "routes": ["L"] }] }
```
</details>

## How it works

**Live map:** each train is drawn at its next station rather than between stations, which keeps the code simple.

**Trip planner:** uses live train data, not the printed timetable.
1. **Direct trips:** find trains that stop at the start and later at the destination.
2. **One transfer:** ride a first train to any later station, walk to a connected platform if needed (walking times come from MTA's `transfers.txt`), then catch a second train that leaves after you arrive and goes to the destination.
3. Sort by arrival time. Show the next 3 trains on each direct line and the best trip for each transfer combination.

It handles at most one transfer, and only sees trains already in the live feed (about the next 30 to 60 minutes).

## Data sources

- Real-time arrivals: MTA GTFS-RT feeds (`api-endpoint.mta.info`)
- Service alerts: MTA subway alerts feed
- Stations, routes and track shapes: MTA static GTFS (`gtfs_subway.zip`)
- Map background: OpenStreetMap tiles
