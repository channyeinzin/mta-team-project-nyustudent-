# NYC Subway Tracker

**Authors:** Himanika Muthukumar, Irmak Caglar, Noel Zin, Prachi Pradhan, Yingyun Zhan (NYU)

A real-time NYC subway web app that finds your closest station, shows when your train is coming and whether its line is running, plans your trip, and draws every train moving live on a map. It uses free, real-time data from the MTA, with no API key needed.

## Tech Stack

| Tool | Purpose |
|---|---|
| Python + Flask | Backend API that serves clean subway data |
| MTA GTFS-Realtime feeds | Live train positions, arrivals and service alerts |
| MTA static GTFS + SQLite | Database of every station, line and track |
| NY Open Data (MTA Subway Stations) | The borough of every station |
| React + Vite | The website |
| Leaflet + OpenStreetMap | The interactive live map |
| Tailwind CSS + Lucide | Styling, dark mode and icons |
| Open-Meteo | Current weather near a station |
| openrouteservice | Real walking routes (optional; otherwise estimated from distance) |
| Browser local storage | Saved stations and trips (no account needed) |
| Dijkstra's algorithm (`backend/dijkstra.py`) | Fastest route on a graph built from the live trains |
| pytest | Backend tests |

## Features

- **Plan a trip from where you are:** tap the GPS button and "From" fills in with your closest station, with a walking line to it on the map. Then type where you're going in "To".
- **Smart station names:** type it how you say it ("25th street", "5th avenue", "union square"), or tap a station on the map. Every station shows its borough, so the six "86 St" stations are easy to tell apart.
- **Live arrivals:** as soon as you pick a start, its next Uptown and Downtown trains show, in minutes
- **Line status:** a colored dot under every train (Good Service, Delays, Suspended…), with a **Why?** button that shows the MTA's alert
- **Fastest route (Dijkstra):** the quickest way from From to To with any number of transfers, drawn on the map
- **Next trains:** the next departures from From to To, direct or with one transfer, plus how far the trip is on foot (miles and minutes)
- **Saved:** keep favorite stations and trips (like your daily commute) and open them with one tap
- **Live map:** every train updates every 10 seconds; moving trains glide to their next station and glow in their line color
- **Line highlight:** tap a line to light it up and fade everything else
- **Weather:** current conditions near your station, with cautions like "walking surfaces may be slippery"
- **Dark mode and full-screen map**

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [MTA live feeds]              [MTA static GTFS]            │
│   trains · alerts               stations · lines · tracks    │
│        ↓                        + NY Open Data boroughs      │
│        ↓                               ↓                     │
│        ↓                        [import_data.py]             │
│        ↓                               ↓                     │
│        ↓                         [subway.db SQLite]          │
│        ↓                               ↓                     │
│   [Flask backend :5001]  ←─────────────┘                     │
│   (downloads feeds every 10 s, plans trips, walk estimates)  │
│        ↓                                                     │
│   JSON API  /api/arrivals  /api/status  /api/trip  ...       │
│        ↓                                                     │
│   [React website :5173]                                      │
│   ┌────────────────────────┐   ┌──────────────────────────┐  │
│   │ Live map (Leaflet)     │   │ Side panel               │  │
│   │  - moving trains       │   │  - From / To with GPS    │  │
│   │  - line highlight      │   │  - arrivals + status     │  │
│   │  - your location       │   │  - trip + walk, saved    │  │
│   └────────────────────────┘   └──────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Installation

You need **Python 3.10+** ([download](https://www.python.org/downloads)) and **Node.js 20+** ([download](https://nodejs.org)).

```bash
# Download the project
git clone https://github.com/channyeinzin/mta-team-project-nyustudent-.git
cd mta-team-project-nyustudent-

# Backend dependencies
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Build the station database (one time, about 1 minute)
python import_data.py             # also refreshes station_boroughs.json

# Website dependencies
cd ../frontend
npm install
```

## How to Run

The app has two parts, so use **two terminal windows**.

**Step 1 - Start the backend (terminal 1):**

```bash
cd backend
source venv/bin/activate
python app.py                     # runs on http://localhost:5001
```

**Step 2 - Start the website (terminal 2):**

```bash
cd frontend
npm run dev
```

**Step 3 - Open the app:**

Go to **http://localhost:5173**, then tap the GPS button next to **From**, or type a station.

**Optional - use real walking routes:**

Get a free key at https://openrouteservice.org/dev/#/signup, then set it in terminal 1 before starting the backend:

```bash
export ORS_API_KEY=your_key_here
python app.py
```

Without it, walking is estimated from the straight-line distance between stations (× 1.3 for the street grid, at 20 minutes a mile).

**Run the tests (optional):**

```bash
cd backend
source venv/bin/activate
pytest
```

## How the fastest route works

The subway becomes a graph. A **node** is a station, either on the platform or on a line (for example "14 St-Union Sq, on the N"). The **edges** are weighted in seconds:

| Edge | From → To | Weight |
|---|---|---|
| Ride | a stop on a line → the next stop on that line | how long trains take between them right now (live feed) |
| Board | platform → a line | 3 minutes, the average wait for a train |
| Get off | a line → platform | 0 |
| Walk | platform → a connected station's platform | the walk time from MTA `transfers.txt` |

Dijkstra's algorithm always expands the point with the smallest total time so far, so the first time it reaches the destination, that route is the fastest. The 3-minute boarding cost means it only changes trains when that saves time. Because the graph comes from the live trains, a suspended line simply has no edges, and the route goes around it.

## Demo Output

Stations near Union Square, from `GET /api/stations/nearby?lat=40.7359&lon=-73.9911`:

```
14 St-Union Sq         N/Q/R/W   0.03 mi
14 St-Union Sq         L         0.08 mi
14 St-Union Sq         4/5/6/6X  0.1 mi
14 St                  F/FX/M    0.31 mi
6 Av                   L         0.31 mi
```

Next trains at 14 St-Union Sq (N/Q/R/W), from `GET /api/arrivals?station=R20`:

```
N   Northbound  to Astoria-Ditmars Blvd       9 min
Q   Southbound  to Coney Island-Stillwell Av  11 min
Q   Northbound  to 96 St                      14 min
N   Southbound  to Coney Island-Stillwell Av  27 min
```

On the website, Northbound and Southbound are shown as **Uptown** and **Downtown**.

## Troubleshooting

| Problem | Fix |
|---|---|
| The map shows no trains | The backend isn't running. Start it in terminal 1. |
| `Port 5001 is in use` | An old copy is running. Close its terminal, or on Mac/Linux run `lsof -ti :5001 \| xargs kill`. |
| `cd: no such file or directory` | You're already in that folder. Run `pwd` to check. |
| The GPS button does nothing | Allow location access in your browser (works on `localhost` and HTTPS). |
| Something broke after `git pull` | Run `npm install` again in `frontend`. |

## API

| Endpoint | Returns |
|---|---|
| `GET /api/stations?q=25th street` | Stations matching what you type, with their borough |
| `GET /api/stations/nearby?lat=..&lon=..` | The 5 closest stations |
| `GET /api/arrivals?station=L03` | Next trains at a station |
| `GET /api/status` | How every line is running, with alerts |
| `GET /api/trip?from=L08&to=A27` | Next trips between two stations |
| `GET /api/route?from=L08&to=A27` | Fastest route with any number of transfers (Dijkstra) |
| `GET /api/routes` | Every line with its official colors |
| `GET /api/subway/routes` · `/stops` · `/trains` | Map data as GeoJSON |
| `GET /api/weather?lat=..&lon=..` | Current weather and travel cautions |
| `GET /api/commute/compare?from=..&to=..` | The same trip by subway and walking, with miles (also a taxi estimate when `ORS_API_KEY` is set) |

## Future Work

- Accounts (Firebase login is already in the code) so saved trips follow you to any device
- Trains that move along the curve of the track instead of in a straight line
- Push alerts when your saved line has delays
- Deploy online so anyone can use it
