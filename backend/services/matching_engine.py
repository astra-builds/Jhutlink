# backend/services/matching_engine.py
# JhutLink — Matching Engine Service
# Phase 2 | Service Layer
# Demonstrates: Scoring algorithm operating on two entity objects without
#               owning either, Two-pass hard-filter then soft-score pattern,
#               Dataclass with computed property for recommendation label,
#               "No constraint = full points" scoring design,
#               Stateless service with zero stored state between calls

from dataclasses import dataclass, field
from backend.entities.listing import Listing, WasteType, QualityGrade
from backend.entities.preference import Preference
from backend.entities.user import Buyer


# ---------------------------------------------------------------------------
# Custom Exception
# ---------------------------------------------------------------------------

class PreferenceNotFoundError(Exception):
    """
    Raised when get_matches() cannot find a Preference record
    for the given buyer in the provided preferences list.

    A buyer without preferences cannot receive personalised recommendations.
    The API layer should prompt the buyer to configure their preferences
    before calling this endpoint.
    """
    def __init__(self, buyer_id: int) -> None:
        self.buyer_id = buyer_id
        super().__init__(
            f"No preference record found for buyer #{buyer_id}. "
            f"The buyer must configure their preferences before "
            f"personalised recommendations can be generated."
        )


# ---------------------------------------------------------------------------
# MatchResult — structured return type per matched listing
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    """
    Represents a single scored listing recommendation for a buyer.

    Using a dataclass here follows the same reasoning as AllocationResult:
    this is pure structured data with one display method. The dataclass
    gives __init__ and __repr__ for free without boilerplate.

    recommendation_label is a computed property rather than a stored field
    because it is entirely derived from score — storing it separately would
    create a way for them to drift out of sync.
    """
    listing_id:      int
    listing:         Listing
    score:           int                       # 0–100
    score_breakdown: dict[str, int] = field(default_factory=dict)

    @property
    def recommendation_label(self) -> str:
        """
        Derives a human-readable recommendation tier from the numeric score.
        Computed on access — never stored, never stale.
        """
        if self.score >= 80:
            return "Strong match"
        if self.score >= 60:
            return "Good match"
        return "Possible match"

    def display(self) -> None:
        """
        Pretty-prints the match result for the demo and notification preview.
        Shows score, breakdown per criterion, and recommendation label.
        """
        print(
            f"\n  [{self.recommendation_label.upper()}]  "
            f"Listing #{self.listing_id} | "
            f"Score: {self.score}/100"
        )
        print(
            f"  {self.listing.waste_type.value} | "
            f"Grade {self.listing.quality_grade.value} | "
            f"{self.listing.quantity_kg} kg | "
            f"৳{self.listing.reserve_price_taka:.2f}/kg | "
            f"{self.listing.location_district}"
        )
        print(f"  Score breakdown:")
        for criterion, points in self.score_breakdown.items():
            bar = "█" * points + "░" * (self._max_for(criterion) - points)
            print(
                f"    {criterion:<28} {points:>3} pts  {bar}"
            )

    @staticmethod
    def _max_for(criterion: str) -> int:
        """Returns the maximum points possible for a given criterion."""
        maxima = {
            "waste_type_match":   30,
            "quality_grade_match": 25,
            "quantity_in_range":  20,
            "price_at_or_below":  15,
            "district_match":     10,
        }
        return maxima.get(criterion, 10)


# ---------------------------------------------------------------------------
# MatchingEngine Service
# ---------------------------------------------------------------------------

class MatchingEngine:
    """
    Stateless service that scores Listing objects against a Buyer's
    Preference record and returns a ranked list of recommendations.

    Two-pass architecture:
        Pass 1 — Hard filter (Preference.matches_listing)
            Binary gate. Listings that fail any hard constraint are
            excluded entirely and never reach the scorer. This keeps
            score_listing() simple — it operates only on listings that
            are fundamentally appropriate.

        Pass 2 — Soft score (score_listing)
            Numeric ranking of surviving listings. Each criterion
            contributes a fixed weight. The buyer's stated preferences
            guide the score, but unconstrained criteria award full points
            automatically — a buyer who doesn't care about district gets
            the district points on every listing.

    Score weights (must sum to 100):
        waste_type_match    30 pts
        quality_grade_match 25 pts
        quantity_in_range   20 pts
        price_at_or_below   15 pts
        district_match      10 pts

    Only listings scoring >= 40 are returned — below that threshold, the
    match is weak enough that surfacing it would erode buyer trust in the
    recommendation system.
    """

    # Score weights — defined as class constants so they are visible and
    # adjustable without hunting through method bodies
    WEIGHT_WASTE_TYPE:   int = 30
    WEIGHT_GRADE:        int = 25
    WEIGHT_QUANTITY:     int = 20
    WEIGHT_PRICE:        int = 15
    WEIGHT_DISTRICT:     int = 10
    MIN_SCORE_THRESHOLD: int = 40

    def score_listing(
        self,
        listing:    Listing,
        preference: Preference,
    ) -> tuple[int, dict[str, int]]:
        """
        Scores a single listing against a buyer's preference record.

        Returns a (total_score, breakdown) tuple:
            total_score: int 0–100
            breakdown:   dict mapping criterion name → points awarded

        "No constraint = full points" rule:
            If preference has no constraint for a criterion (empty list
            or None), the full weight is awarded. The buyer is not penalised
            for not specifying a preference they don't care about.

        This method assumes matches_listing() has already passed for this
        listing — it does not re-run hard filters.
        """
        breakdown: dict[str, int] = {}

        # --- Criterion 1: Waste type (30 pts) ---------------------------
        if not preference.preferred_waste_types:
            # No constraint → full points
            breakdown["waste_type_match"] = self.WEIGHT_WASTE_TYPE
        elif listing.waste_type in preference.preferred_waste_types:
            breakdown["waste_type_match"] = self.WEIGHT_WASTE_TYPE
        else:
            breakdown["waste_type_match"] = 0

        # --- Criterion 2: Quality grade (25 pts) ------------------------
        if not preference.preferred_grades:
            breakdown["quality_grade_match"] = self.WEIGHT_GRADE
        elif listing.quality_grade in preference.preferred_grades:
            breakdown["quality_grade_match"] = self.WEIGHT_GRADE
        else:
            breakdown["quality_grade_match"] = 0

        # --- Criterion 3: Quantity within range (20 pts) ----------------
        qty = listing.quantity_kg
        above_min = qty >= preference.min_quantity_kg
        below_max = (
            preference.max_quantity_kg is None
            or qty <= preference.max_quantity_kg
        )
        if above_min and below_max:
            breakdown["quantity_in_range"] = self.WEIGHT_QUANTITY
        else:
            breakdown["quantity_in_range"] = 0

        # --- Criterion 4: Price at or below ceiling (15 pts) ------------
        if preference.max_price_per_kg_taka is None:
            # No price ceiling → full points
            breakdown["price_at_or_below"] = self.WEIGHT_PRICE
        elif listing.reserve_price_taka <= preference.max_price_per_kg_taka:
            breakdown["price_at_or_below"] = self.WEIGHT_PRICE
        else:
            breakdown["price_at_or_below"] = 0

        # --- Criterion 5: District match (10 pts) -----------------------
        if not preference.preferred_districts:
            breakdown["district_match"] = self.WEIGHT_DISTRICT
        elif listing.location_district in preference.preferred_districts:
            breakdown["district_match"] = self.WEIGHT_DISTRICT
        else:
            breakdown["district_match"] = 0

        total_score = sum(breakdown.values())
        return total_score, breakdown

    def get_matches(
        self,
        buyer:       Buyer,
        listings:    list[Listing],
        preferences: list[Preference],
    ) -> list[MatchResult]:
        """
        Returns a ranked list of MatchResult objects for a given buyer.

        Pipeline:
          1. Find the buyer's Preference record in the preferences list
          2. Hard-filter listings using preference.matches_listing()
          3. Score each surviving listing using score_listing()
          4. Discard listings below MIN_SCORE_THRESHOLD (40)
          5. Sort by score descending and return

        Args:
            buyer:       The Buyer whose preferences drive the matching.
            listings:    All active Listing objects to consider.
            preferences: All Preference records — engine finds the right one.

        Returns:
            List of MatchResult objects sorted highest score first.
            Empty list if no listings meet the threshold.

        Raises:
            PreferenceNotFoundError: if no preference for this buyer exists.
        """
        # Step 1 — Locate this buyer's preference record
        buyer_preference: Preference | None = None
        for pref in preferences:
            if pref.buyer_id == buyer.id:
                buyer_preference = pref
                break

        if buyer_preference is None:
            raise PreferenceNotFoundError(buyer_id=buyer.id)

        # Step 2 & 3 — Hard filter then score
        results: list[MatchResult] = []

        for listing in listings:
            passes, _ = buyer_preference.matches_listing(listing)

            if not passes:
                continue  # Hard filtered out — skip scoring entirely

            score, breakdown = self.score_listing(listing, buyer_preference)

            # Step 4 — Apply minimum score threshold
            if score < self.MIN_SCORE_THRESHOLD:
                continue

            results.append(
                MatchResult(
                    listing_id=listing.listing_id,
                    listing=listing,
                    score=score,
                    score_breakdown=breakdown,
                )
            )

        # Step 5 — Sort by score descending
        results.sort(key=lambda r: r.score, reverse=True)
        return results


# ---------------------------------------------------------------------------
# Demo — run with: python -m backend.services.matching_engine
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    from backend.entities.listing import Listing, WasteType, QualityGrade
    from backend.entities.user import Buyer
    from backend.entities.preference import Preference

    def section(title: str) -> None:
        print(f"\n{'=' * 65}")
        print(f"  {title}")
        print(f"{'=' * 65}")

    # ===================================================================
    section("JHUTLINK — MatchingEngine Demo")

    # -------------------------------------------------------------------
    # Buyer setup
    # -------------------------------------------------------------------
    section("STEP 1 — Create buyer and configure preferences")

    buyer = Buyer(
        name="Green Recyclers Ltd",
        email="procurement@greenrecyclers.bd",
        password_hash="hashed_pass",
        tier="Mid",
    )
    buyer.status = "active"

    # Preference: Cotton or Denim, Grade A or B, 100+ kg,
    # max ৳80/kg (8000 paisa), Dhaka district only
    pref = Preference(
        buyer_id=buyer.id,
        preferred_waste_types=[WasteType.COTTON, WasteType.DENIM],
        preferred_grades=[QualityGrade.A, QualityGrade.B],
        min_quantity_kg=100,
        max_price_per_kg_taka=80.0,
        preferred_districts=["Dhaka"],
    )

    print(f"\n  Buyer    : {buyer}")
    print(f"  {pref}")

    # -------------------------------------------------------------------
    # Build 5 listings with varying characteristics
    # -------------------------------------------------------------------
    section("STEP 2 — Create 5 listings")

    # Listing 1: STRONG MATCH — Cotton A, Dhaka, 200 kg, ৳70/kg
    l1 = Listing(
        seller_id=10, waste_type=WasteType.COTTON,
        quantity_kg=250, reserve_price_taka=70.0,
        quality_grade=QualityGrade.A,
        location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=48,
    )
    l1.open_auction()

    # Listing 2: GOOD MATCH — Denim B, Dhaka, 150 kg, ৳75/kg
    # District matches, but grade is B (still preferred), price is high-ish
    l2 = Listing(
        seller_id=11, waste_type=WasteType.DENIM,
        quantity_kg=190, reserve_price_taka=75.0,
        quality_grade=QualityGrade.B,
        location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=24,
    )
    l2.open_auction()

    # Listing 3: POSSIBLE MATCH — Cotton B, Gazipur (wrong district), ৳60/kg
    # Passes hard filter (type/grade/qty/price OK), loses district points
    l3 = Listing(
        seller_id=12, waste_type=WasteType.COTTON,
        quantity_kg=130, reserve_price_taka=60.0,
        quality_grade=QualityGrade.B,
        location_district="Gazipur",               # not in preferred districts
        photos=["a.jpg", "b.jpg"], auction_duration_hours=48,
    )
    l3.open_auction()

    # Listing 4: HARD FILTERED — Polyester C, Dhaka
    # Fails waste type AND grade hard filter — never reaches scorer
    l4 = Listing(
        seller_id=13, waste_type=WasteType.POLYESTER,
        quantity_kg=300, reserve_price_taka=50.0,
        quality_grade=QualityGrade.C,
        location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=24,
    )
    l4.open_auction()

    # Listing 5: HARD FILTERED — Cotton A but price above ceiling
    # ৳90/kg > ৳80/kg ceiling → filtered before scoring
    l5 = Listing(
        seller_id=14, waste_type=WasteType.COTTON,
        quantity_kg=200, reserve_price_taka=90.0,
        quality_grade=QualityGrade.A,
        location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=48,
    )
    l5.open_auction()

    all_listings = [l1, l2, l3, l4, l5]

    print(f"\n  Created {len(all_listings)} listings:")
    for lst in all_listings:
        print(
            f"    Listing #{lst.listing_id}: "
            f"{lst.waste_type.value} | "
            f"Grade {lst.quality_grade.value} | "
            f"{lst.quantity_kg} kg | "
            f"৳{lst.reserve_price_taka:.2f}/kg | "
            f"{lst.location_district}"
        )

    # -------------------------------------------------------------------
    # Show hard-filter results explicitly before running engine
    # -------------------------------------------------------------------
    section("STEP 3 — Hard filter walkthrough (before scoring)")

    print()
    for lst in all_listings:
        passes, reason = pref.matches_listing(lst)
        status_icon = "✓ PASSES" if passes else "✗ FILTERED"
        print(f"  Listing #{lst.listing_id} ({lst.waste_type.value} "
              f"Grade {lst.quality_grade.value}):  {status_icon}")
        if not passes:
            print(f"    Reason: {reason}")

    # -------------------------------------------------------------------
    # Run the matching engine
    # -------------------------------------------------------------------
    section("STEP 4 — MatchingEngine.get_matches() results")

    engine = MatchingEngine()
    matches = engine.get_matches(
        buyer=buyer,
        listings=all_listings,
        preferences=[pref],
    )

    print(f"\n  {len(matches)} listing(s) passed filter and met score threshold:\n")
    for match in matches:
        match.display()

    # -------------------------------------------------------------------
    # Show preference update in action
    # -------------------------------------------------------------------
    section("STEP 5 — Update preference and re-run matching")

    print("\n  Updating preferred_districts to include 'Gazipur'...")
    pref.update("preferred_districts", ["Dhaka", "Gazipur"])
    print(f"  {pref}")

    matches_updated = engine.get_matches(
        buyer=buyer,
        listings=all_listings,
        preferences=[pref],
    )
    print(
        f"\n  Results after update: "
        f"{len(matches_updated)} listing(s) returned "
        f"(was {len(matches)}):"
    )
    for match in matches_updated:
        print(
            f"  Listing #{match.listing_id} | "
            f"Score: {match.score}/100 | "
            f"{match.recommendation_label}"
        )

    # -------------------------------------------------------------------
    # PreferenceNotFoundError guard
    # -------------------------------------------------------------------
    section("STEP 6 — PreferenceNotFoundError guard")

    buyer_no_pref = Buyer(
        name="No Prefs Buyer",
        email="noprefs@example.com",
        password_hash="hash",
        tier="Micro",
    )

    try:
        engine.get_matches(
            buyer=buyer_no_pref,
            listings=all_listings,
            preferences=[pref],  # pref belongs to different buyer
        )
    except PreferenceNotFoundError as e:
        print(f"\n  ✓ Caught PreferenceNotFoundError:")
        print(f"    Buyer ID: {e.buyer_id}")
        print(f"    Message : {e}")

    # -------------------------------------------------------------------
    # PreferenceFieldError guard
    # -------------------------------------------------------------------
    section("STEP 7 — PreferenceFieldError guard")

    from backend.entities.preference import PreferenceFieldError
    try:
        pref.update("favourite_colour", "green")
    except PreferenceFieldError as e:
        print(f"\n  ✓ Caught PreferenceFieldError:")
        print(f"    Invalid field : '{e.field}'")
        print(f"    Valid fields  : {sorted(e.valid_fields)}")

    section("Demo complete — MatchingEngine fully verified")