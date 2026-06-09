import json
import os
import time
import logging
from collections import defaultdict

logger = logging.getLogger("jhutlink.ai")

CACHE_TTL = 300

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


class AIService:
    def __init__(self, storage):
        self._storage = storage
        self._cache = None
        self._cache_time = 0

    def get_insights(self) -> dict:
        now = time.time()
        if self._cache and (now - self._cache_time) < CACHE_TTL:
            return self._cache

        data = self._collect_market_data()
        result = self._call_ai(data)
        self._cache = result
        self._cache_time = now
        return result

    def _collect_market_data(self) -> dict:
        listings = self._storage.load_listings()
        orders = self._storage.load_orders()
        users = self._storage.load_users()
        bids = self._storage.load_bids()

        active = [l for l in listings if l.status.value == "ACTIVE"]

        district_counts = defaultdict(lambda: {"listings": 0, "sellers": set(), "volume": 0})
        for l in listings:
            d = l.location_district
            district_counts[d]["listings"] += 1
            district_counts[d]["sellers"].add(l.seller_id)
            district_counts[d]["volume"] += l.quantity_kg

        type_stats = defaultdict(lambda: {"count": 0, "prices": [], "volume": 0, "grade_counts": defaultdict(int)})
        for l in listings:
            wt = l.waste_type.value
            type_stats[wt]["count"] += 1
            type_stats[wt]["prices"].append(l.reserve_price_taka)
            type_stats[wt]["volume"] += l.quantity_kg
            type_stats[wt]["grade_counts"][l.quality_grade.value] += 1

        avg_prices = {
            wt: round(sum(d["prices"]) / len(d["prices"]), 2)
            for wt, d in type_stats.items() if d["prices"]
        }

        completed = [o for o in orders if o.status.value == "COMPLETED"]

        grade_prices = defaultdict(list)
        for l in listings:
            grade_prices[l.quality_grade.value].append(l.reserve_price_taka)

        avg_prices_by_grade = {
            g: round(sum(prices) / len(prices), 2)
            for g, prices in grade_prices.items() if prices
        }

        price_spreads = {}
        for l in listings:
            wt = l.waste_type.value
            if wt not in price_spreads:
                price_spreads[wt] = {"min": float("inf"), "max": 0, "prices": []}
            price_spreads[wt]["min"] = min(price_spreads[wt]["min"], l.reserve_price_taka)
            price_spreads[wt]["max"] = max(price_spreads[wt]["max"], l.reserve_price_taka)
            price_spreads[wt]["prices"].append(l.reserve_price_taka)
        for wt, data in price_spreads.items():
            prices = data.pop("prices")
            data["avg"] = round(sum(prices) / len(prices), 2)
            data["spread_taka"] = round(data["max"] - data["min"], 2)

        total_bids = len(bids)
        matched_bids = [b for b in bids if b.status.value == "MATCHED"]
        pending_bids = [b for b in bids if b.status.value == "PENDING"]

        listing_map = {l.listing_id: l for l in listings}
        bid_prices_by_type = defaultdict(list)
        bid_prices_by_district = defaultdict(list)
        bid_prices_by_grade = defaultdict(list)
        for b in bids:
            listing = listing_map.get(b.listing_id)
            if listing:
                bid_prices_by_type[listing.waste_type.value].append(b.price_per_kg_taka)
                bid_prices_by_district[listing.location_district].append(b.price_per_kg_taka)
                bid_prices_by_grade[listing.quality_grade.value].append(b.price_per_kg_taka)

        avg_bid_price_by_type = {
            wt: round(sum(prices) / len(prices), 2)
            for wt, prices in bid_prices_by_type.items() if prices
        }
        avg_bid_price_by_district = {
            d: round(sum(prices) / len(prices), 2)
            for d, prices in bid_prices_by_district.items() if prices
        }
        avg_bid_price_by_grade = {
            g: round(sum(prices) / len(prices), 2)
            for g, prices in bid_prices_by_grade.items() if prices
        }

        avg_order_value = round(
            sum(o.total_value_taka for o in completed) / len(completed), 2
        ) if completed else 0

        return {
            "active_listings": len(active),
            "total_listings": len(listings),
            "completed_orders": len(completed),
            "total_volume_kg": sum(o.quantity_kg for o in completed),
            "total_revenue_taka": round(sum(o.total_value_taka for o in completed), 2),
            "pending_orders": len([o for o in orders if o.status.value not in ("COMPLETED", "CANCELLED")]),
            "total_users": len(users),
            "avg_order_value_taka": avg_order_value,
            "district_breakdown": {
                d: {"listings": v["listings"], "sellers": len(v["sellers"]), "volume_kg": v["volume"]}
                for d, v in sorted(district_counts.items(), key=lambda x: -x[1]["listings"])
            },
            "waste_type_breakdown": {
                wt: {
                    "count": v["count"],
                    "avg_price_taka": avg_prices.get(wt, 0),
                    "volume_kg": v["volume"],
                    "grades": dict(v["grade_counts"]),
                }
                for wt, v in type_stats.items()
            },
            "bids": {
                "total": total_bids,
                "matched": len(matched_bids),
                "pending": len(pending_bids),
                "match_rate": round(len(matched_bids) / total_bids * 100, 1) if total_bids else 0,
                "avg_price_per_kg_by_type": avg_bid_price_by_type,
                "avg_price_per_kg_by_district": avg_bid_price_by_district,
                "avg_price_per_kg_by_grade": avg_bid_price_by_grade,
            },
            "price_spreads_by_type": price_spreads,
            "avg_price_by_grade": avg_prices_by_grade,
        }

    def _build_prompt(self, data: dict) -> str:
        return f"""You are a market intelligence AI for Jhutlink, a textile waste marketplace in Bangladesh.
Analyze this marketplace data and return a JSON object with insights.

DATA:
{json.dumps(data, indent=2)}

Return ONLY valid JSON with exactly these fields:
{{
  "summary": "2-3 sentence market overview highlighting key trends, volume changes, and notable activity",
  "price_forecast": [
    {{"waste_type": "Cotton", "direction": "up|flat|down", "range": "3-5", "reason": "brief reason"}}
  ],
  "district_spotlight": "1-2 sentences about the most active or notable district",
  "key_insight": "One specific, actionable insight for marketplace participants",
  "patterns_found": [
    {{"pattern": "short label", "description": "explanation of what the data reveals", "confidence": "high|medium|low", "impact": "positive|negative|neutral"}}
  ]
}}

Guidelines:
- Include ALL waste types found in the data in price_forecast.
- Direction must be exactly "up", "flat", or "down".
- For patterns_found, identify 2-4 specific patterns, anomalies, or correlations from the data.
  Look for price disparities, grade-to-district correlations, bid-to-listing mismatches,
  volume clustering, or unusual market activity. Use confidence "high" only when the
  data strongly supports the pattern. Impact reflects whether this helps or hurts market participants."""

    def _call_ai(self, data: dict) -> dict:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or OpenAI is None:
            logger.warning("OPENAI_API_KEY not set — returning fallback insights")
            return self._fallback_insights(data)

        try:
            client = OpenAI(api_key=api_key)
            prompt = self._build_prompt(data)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a market intelligence AI. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("AI call failed: %s", e)
            return self._fallback_insights(data)

    def _fallback_insights(self, data: dict) -> dict:
        top = max(data["district_breakdown"].items(), key=lambda x: x[1]["listings"], default=(None, None))
        by_type = data["waste_type_breakdown"]
        spreads = data.get("price_spreads_by_type", {})
        bids_data = data.get("bids", {})

        patterns = []

        if len(spreads) >= 2:
            spreadiest = max(spreads.items(), key=lambda x: x[1]["spread_taka"])
            patterns.append({
                "pattern": f"{spreadiest[0]} price spread",
                "description": (
                    f"{spreadiest[0]} shows the widest price range (৳{spreadiest[1]['spread_taka']}/kg), "
                    f"indicating significant quality or negotiation flexibility."
                ),
                "confidence": "high",
                "impact": "neutral",
            })

        if by_type:
            highest = max(by_type.items(), key=lambda x: x[1]["avg_price_taka"])
            lowest = min(by_type.items(), key=lambda x: x[1]["avg_price_taka"])
            if highest[0] != lowest[0]:
                patterns.append({
                    "pattern": "Type price gap",
                    "description": (
                        f"{highest[0]} (৳{highest[1]['avg_price_taka']}/kg) trades at "
                        f"{(highest[1]['avg_price_taka'] - lowest[1]['avg_price_taka']) / lowest[1]['avg_price_taka'] * 100:.0f}% "
                        f"premium over {lowest[0]} (৳{lowest[1]['avg_price_taka']}/kg)."
                    ),
                    "confidence": "high",
                    "impact": "positive",
                })

        if bids_data.get("total", 0) > 0:
            match_rate = bids_data["match_rate"]
            if match_rate < 50:
                patterns.append({
                    "pattern": "Low bid match rate",
                    "description": (
                        f"Only {match_rate}% of bids get matched ({bids_data['matched']}/{bids_data['total']}). "
                        "Sellers may be pricing above market or buyers are bidding too selectively."
                    ),
                    "confidence": "medium",
                    "impact": "negative",
                })

        if not patterns:
            patterns.append({
                "pattern": "Market in early stage",
                "description": "Limited data available for pattern detection. More listings and orders will enable deeper analysis.",
                "confidence": "low",
                "impact": "neutral",
            })

        return {
            "summary": (
                f"The marketplace has {data['active_listings']} active listings "
                f"across {len(data['district_breakdown'])} districts "
                f"with {data['completed_orders']} completed orders "
                f"totaling {data['total_volume_kg']:,} kg."
            ),
            "price_forecast": [
                {"waste_type": wt, "direction": "flat", "range": "0-2", "reason": "Insufficient data for AI forecast"}
                for wt in by_type
            ],
            "district_spotlight": (
                f"Top district: {top[0]} with {top[1]['listings']} listings"
                if top[0] else "No district data available yet."
            ),
            "key_insight": (
                "AI-powered insights will appear here once the OpenAI service is configured. "
                "Market data is being collected and ready for analysis."
            ),
            "patterns_found": patterns,
        }
