import mta

data = mta._cached(mta.ALERTS_URL, mta._download_json)

for entity in data.get("entity", []):
    alert = entity.get("alert", {})

    texts = alert.get("header_text", {}).get("translation", [])
    description = next(
        (t["text"] for t in texts if t.get("language") == "en"),
        ""
    )

    affected = alert.get("informed_entity", [])

    directions = {
        e.get("direction_id")
        for e in affected
        if e.get("direction_id") is not None
    }

    if directions and (
        "uptown" in description.lower()
        or "downtown" in description.lower()
        or "northbound" in description.lower()
        or "southbound" in description.lower()
    ):
        print("Alert:", description)
        print("Direction IDs:", directions)
        print("-" * 50)