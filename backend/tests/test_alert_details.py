import mta

data = mta._cached(mta.ALERTS_URL, mta._download_json)

for entity in data.get("entity", []):
    alert = entity.get("alert", {})
    affected = alert.get("informed_entity", [])

    if any(item.get("route_id") == "1" for item in affected):
        print("Alert ID:", entity.get("id"))
        print("Affected entities:", affected)
        print()
        break