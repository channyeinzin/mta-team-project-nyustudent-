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
| pytest | Backend tests |

## Features

- **Near me:** one tap shows your location, a walking line to your closest station, and the 5 stations nearest you
- **Station search:** type it how you say it ("25th street", "5th avenue", "union square"), or tap a station on the map. Every station shows its borough, so the six "86 St" stations are easy to tell apart.
- **Live arrivals:** the next Uptown and Downtown trains at any station, in minutes
- **Line status:** a colored dot under every train (Good Service, Delays, Suspended…), with a **Why?** button that shows the MTA's alert
- **Trip planner:** type a destination and get the next trains, direct or with one transfer. "From" fills in your closest station automatically, and you also see how far the trip is on foot (miles and minutes).
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
│   │  - moving trains       │   │  - Near me / search      │  │
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

Go to **http://localhost:5173**, then try **Near me** or **Plan a trip**.

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

## Demo Output

Search typed the way people say it, from `GET /api/stations?q=25th street`:

```
25 St          Brooklyn   D/N/R/W
Beach 25 St    Queens     A
```

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

Trip planner, 14 St-Union Sq (L) to Times Sq-42 St (1/2/3): the next trains, plus

```
Or walk: 1.85 mi · about 37 min (estimate)
```

## What we changed after user testing

We had a classmate use the app and turned each piece of feedback into a fix:

| Feedback | What we changed |
|---|---|
| Typing "25th" found nothing; only "25 St" worked | Search now understands "25th", "street", "avenue", "square" and spelled-out numbers, and ranks exact matches first |
| Stations with the same name were hard to tell apart | Every station shows its borough (from the MTA's station list on NY Open Data) |
| "Compare" was a separate box that made you retype both stations | Walking distance and time now appear right inside the trip planner |

## Troubleshooting

| Problem | Fix |
|---|---|
| The map shows no trains | The backend isn't running. Start it in terminal 1. |
| `Port 5001 is in use` | An old copy is running. Close its terminal, or on Mac/Linux run `lsof -ti :5001 \| xargs kill`. |
| `cd: no such file or directory` | You're already in that folder. Run `pwd` to check. |
| **Near me** does nothing | Allow location access in your browser (works on `localhost` and HTTPS). |
| Something broke after `git pull` | Run `npm install` again in `frontend`. |
| The map's station labels don't show a borough | Your browser cached the old station list. Press Cmd+Shift+R (Windows: Ctrl+Shift+R). |

## API

| Endpoint | Returns |
|---|---|
| `GET /api/stations?q=25th street` | Stations matching what you type, with their borough |
| `GET /api/stations/nearby?lat=..&lon=..` | The 5 closest stations |
| `GET /api/arrivals?station=L03` | Next trains at a station |
| `GET /api/status` | How every line is running, with alerts |
| `GET /api/trip?from=L08&to=A27` | Next trips between two stations |
| `GET /api/routes` | Every line with its official colors |
| `GET /api/subway/routes` · `/stops` · `/trains` | Map data as GeoJSON |
| `GET /api/weather?lat=..&lon=..` | Current weather and travel cautions |
| `GET /api/commute/compare?from=..&to=..` | The same trip by subway and walking, with miles (also a taxi estimate when `ORS_API_KEY` is set) |

## Future Work

- Accounts (Firebase login is already in the code) so saved trips follow you to any device
- Trains that move along the curve of the track instead of in a straight line
- Push alerts when your saved line has delays
- Deploy online so anyone can use it
